---
name: remove-worktree
description: Retire a finished worktree, releasing whatever holds it open. Use after a PR merges, or when `git worktree remove` fails.
---

# Retire a worktree

On Windows a directory cannot be deleted while any process holds a **handle**
inside it, and a dev server holds several. Worse, `git worktree remove`
deregisters the tree *before* deleting it, so a remove that hits a handle leaves
the tree **stranded**: every file still on disk, git no longer aware of it.
Release the handles first, prove the tree unlocked, then remove.

Two refusals look alike and differ completely:

- `contains modified or untracked files, use --force` (from outside, on a dirty
  tree): nothing happened; the worktree is still registered.
- `failed to delete '<path>': Permission denied` (a handle, often your own
  shell's cwd): the tree is now stranded. Recover it with
  [Stranded tree](#stranded-tree).

Creation is `new-worktree`.

## 1. Confirm the work landed

Compare against the remote; local `main` lags and has misreported in both
directions.

```bash
git fetch origin
git -C <worktree> log --oneline origin/main..HEAD   # unmerged commits
git -C <worktree> status --short                    # uncommitted changes
```

**Done when** both print nothing. Anything listed is live work: stop and report
what it is.

## 2. Stand at the repo root

```bash
cd "$(git rev-parse --git-common-dir)/.."
```

Your shell's cwd is a handle, and it alone strands the tree on Windows.

## 3. Release the holders

### Windows

One `next dev` is four node processes: the npx wrapper, the next CLI, the port
owner, and a **turbopack worker** whose command line points inside `.next/`. The
worker holds the blocking handle, so ending only the port owner leaves the tree
locked. Each worktree has its own `node_modules`, so the worktree path in the
command line selects all of them, and the port catches anything it missed.

```powershell
$wt  = '<absolute path to the worktree>'
$ids = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
         Where-Object { $_.CommandLine -match [Regex]::Escape($wt) } |
         Select-Object -ExpandProperty ProcessId)
$ids += @(Get-NetTCPConnection -LocalPort <port> -State Listen -ErrorAction SilentlyContinue |
          Select-Object -ExpandProperty OwningProcess)
$ids = $ids | Sort-Object -Unique
$ids
```

Show the ids, then end them:

```powershell
foreach ($id in $ids) { try { Stop-Process -Id $id -Force -ErrorAction Stop } catch {} }
```

### macOS and Linux

An open file never blocks a delete here, but a live dev server keeps writing and
can recreate `.next` under the delete. Stop it:

```bash
kill $(lsof -ti tcp:<port>) 2>/dev/null
pkill -f '<absolute path to the worktree>'
```

## 4. Prove it unlocked

### Windows

A rename fails while anything holds a handle inside the directory, so it is the
cheapest lock test:

```powershell
try   { Rename-Item $wt "$wt-locktest" -ErrorAction Stop
        Rename-Item "$wt-locktest" $wt; 'UNLOCKED' }
catch { "STILL LOCKED: $($_.Exception.Message)" }
```

**Done when** it prints `UNLOCKED`. On `STILL LOCKED`, find the holder with
[`holders.md`](holders.md).

### macOS and Linux

A rename succeeds here even with files open, so it proves nothing. Continue to
step 5; `holders.md` covers the rare `Device or resource busy`.

## 5. Remove

```bash
git worktree remove .claude/worktrees/<name>
git worktree prune
git branch -d <branch>
```

Treat each refusal as a finding and read it before overriding:

- `contains modified or untracked files`: step 1 missed something, or a build
  wrote into the tree afterwards. Look at the files; `--force` discards them.
- `git branch -d` refusing: the branch is unmerged, which contradicts step 1.
  Say so before using `-D`.

**Done when** neither `git worktree list` nor `ls .claude/worktrees/` shows it.

## Stranded tree

A directory under `.claude/worktrees/` that `git worktree list` omits. Git can no
longer remove it: `remove` answers `is not a working tree`, and `prune` finds
nothing. On Windows, run steps 3 and 4 until `UNLOCKED`, then delete it yourself
and reconcile, in this order:

```bash
rm -rf .claude/worktrees/<name>
git worktree prune
git branch -d <branch>
```
