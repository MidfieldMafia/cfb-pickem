---
name: remove-worktree
description: Retire a finished worktree on Windows or macOS, releasing whatever blocks its deletion. Use after a PR merges, or when `git worktree remove` fails.
---

# Retire a worktree

Removal is four commands on macOS and Linux. On Windows a directory cannot be
deleted while any process holds an open **handle** inside it, so a running dev
server turns those four commands into a stranded half-removed tree.

Two failures wear similar words and behave nothing alike. Both measured here:

> **From outside, on a dirty tree** — `fatal: '<path>' contains modified or
> untracked files, use --force to delete it`. Nothing happened, and the worktree
> is still registered. This refusal is safe.
>
> **From inside the tree, on Windows** — `error: failed to delete '<path>':
> Permission denied`. `git worktree remove` deregisters **first** and deletes
> second, so git has already forgotten the tree while every file remains.
> `git worktree list` goes quiet, `remove` now answers `is not a working tree`,
> and `prune` has nothing left to prune. A failed remove is not a no-op.

So stand outside and release the handles *before* calling remove. Step 3 is how;
step 6 recovers a tree already stranded.

Steps 3, 4 and 7 differ by platform and each says which. Steps 1, 2, 5 and 6 are
the same everywhere.

Creation is the other half and has its own skill — `new-worktree`.

## 1. Confirm the work actually landed

Check the remote, not local `main`, which lags and has produced false readings
in both directions — work reported missing that had merged, and work reported
merged that lived in another worktree.

```bash
git fetch origin
git -C <worktree> log --oneline origin/main..HEAD   # empty = fully merged
git -C <worktree> status --short                    # empty = nothing uncommitted
git worktree list
```

An empty range and a clean status mean the worktree is safe to retire. Anything
listed is unmerged or uncommitted work — stop and say what it is.

## 2. Stand outside it

Run the removal from the repo root on every platform:

```bash
cd "$(git rev-parse --git-common-dir)/.."
```

On Windows this is not hygiene, it is the difference between a clean removal and
a stranded tree: your shell's own working directory is a handle, and removing
from inside produces exactly the `Permission denied` half-removal above.

## 3. Release what is holding the tree

### macOS and Linux

Unlinking a file that a process still has open is allowed here, so an open
handle never blocks the delete and there is nothing to release. Stop a dev
server running in this tree anyway — it holds the port and keeps writing into a
directory you are deleting, which can recreate `.next` underneath the delete:

```bash
kill $(lsof -ti tcp:<port>) 2>/dev/null         # the server on this tree's port
pkill -f '<absolute path to the worktree>'      # anything else naming the tree
```

Then go straight to **step 5**. The lock probe in step 4 answers nothing on
these platforms, and step 4 says why.

### Windows

One `next dev` is **four** node processes, and the one listening on the port is
only one of them. Measured on this machine:

```
next cli          node .../worktree/node_modules/.bin/../next/dist/bin/next dev -p 3101
port owner        node .../worktree/node_modules/next/dist/server/lib/start-server.js
turbopack worker  node .../worktree/.next/dev/build/chunks/pool_entry-[turbopack-node]...
npx wrapper       node .../npm/bin/npx-cli.js next dev -p 3101
```

The turbopack worker is the one that matters: its command line points *inside*
`.next/`, so it holds the handle that blocks the delete. Ending the port owner
alone leaves it running and the directory still locked — that is why cleanup
keeps failing.

Three of the four carry the worktree path in their command line, because each
worktree gets its own `node_modules` from `npm ci`. That makes the path the
reliable selector. PowerShell, since `Win32_Process` is where command lines
live:

```powershell
$wt   = '<absolute path to the worktree>'
$esc  = [Regex]::Escape($wt)
$ids  = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
          Where-Object { $_.CommandLine -match $esc } |
          Select-Object -ExpandProperty ProcessId)
$ids += @(Get-NetTCPConnection -LocalPort <port> -State Listen -ErrorAction SilentlyContinue |
          Select-Object -ExpandProperty OwningProcess)
$ids = $ids | Sort-Object -Unique
$ids
```

The port lookup is a second net for anything the path missed. The selector
matches on path, so a process from a different checkout never appears — still,
show the ids before ending them.

```powershell
foreach ($id in $ids) { try { Stop-Process -Id $id -Force -ErrorAction Stop } catch {} }
```

The npx wrapper holds nothing inside the tree and exits once its children go.

## 4. Probe for the lock

### Windows

Renaming a directory fails while anything holds a handle inside it, which makes
a rename the cheapest yes-or-no answer. Ask it about the worktree root, which
exists whatever state the tree is in:

```powershell
try   { Rename-Item $wt "$wt-locktest" -ErrorAction Stop
        Rename-Item "$wt-locktest" $wt; 'UNLOCKED' }
catch { "STILL LOCKED: $($_.Exception.Message)" }
```

`UNLOCKED` is the gate for step 5. On `STILL LOCKED`, the message names the
holder and step 7 covers what else it can be.

### macOS and Linux

There is no lock to probe. A rename succeeds on a directory whose files are
open, so the probe would print `UNLOCKED` while a dev server writes into the
tree — a confident answer to a question that does not apply. Ask what is still
*writing* instead:

```bash
lsof +D <worktree> | head
```

Empty means nothing has the tree open. Output is a warning rather than a
blocker: the delete will succeed regardless, so this only tells you whether you
are about to pull the floor out from under a running process.

## 5. Remove

```bash
git worktree remove .claude/worktrees/<name>
git worktree prune
git branch -d <branch>
```

Two refusals are worth expecting, and neither should be forced reflexively:

- `contains modified or untracked files` means step 1 missed something, or a
  build wrote into the tree after you checked. Look at what it is before
  reaching for `--force` — `--force` on a dirty tree discards real work.
- `git branch -d` refuses a branch that is not merged, a useful second opinion
  on step 1. Reaching for `-D` overrides that — say so out loud first.

Confirm with `git worktree list` and `ls .claude/worktrees/`. Both should show
the worktree gone.

## 6. Recover a stranded tree

The signature is a directory under `.claude/worktrees/` that `git worktree list`
does not mention: a failed remove already dropped the registration. Git will not
help you here — `git worktree remove` reports the path is not a worktree, and
`prune` has nothing left to prune.

On Windows, release the handles (step 3) and confirm `UNLOCKED` (step 4) first;
on macOS and Linux, go straight ahead. Then delete the directory yourself and
reconcile git:

```bash
rm -rf .claude/worktrees/<name>
git worktree prune
git branch -d <branch>          # the branch outlives the worktree
```

Order matters: prune once the files are actually gone.

## 7. When something still holds the tree

Reached from a `STILL LOCKED` probe on Windows, or from a delete that fails
anywhere with `Device or resource busy`.

**A working directory is not part of a command line**, so a process merely
*sitting* in the worktree is invisible to a command-line scan — and the only
thing matching the path is often your own scanning shell, which reads as a
reassuring "nothing holds it" while the delete keeps failing.

That is a real case, not a hypothetical: an `until gh pr checks 62 ...; do sleep
20; done` loop, launched with its cwd inside a worktree, outlived that worktree
and blocked the delete. Nothing in its command line named the tree.

Kill the **parent** and rescan. A `sleep` child rotates its pid on every loop,
so chasing the child never converges.

### macOS and Linux

`lsof` reports open files and working directories together, which is why one
tool covers what takes two on Windows:

```bash
wt='<absolute path to the worktree>'
lsof -a -d cwd +D "$wt"      # processes sitting in the tree
lsof +D "$wt"                # everything with a file open under it
pgrep -af "$wt"              # anything naming it on its command line
```

`+D` walks the whole tree, so it is slow across a warm `node_modules` — the
`-d cwd` form is the fast question and usually the one that answers it.

### Windows

Run **both** scans. They cover different populations, and neither is a superset
of the other.

Working directories, from Git Bash — catches anything descended from a shell:

```bash
wt=<worktree path fragment>
for p in /proc/[0-9]*; do
  c=$(readlink "$p/cwd" 2>/dev/null)
  case "$c" in *$wt*) echo "$p winpid=$(cat $p/winpid 2>/dev/null) $(tr '\0' ' ' < $p/cmdline | cut -c1-80)";; esac
done
```

Command lines, from PowerShell — catches anything launched outside a shell:

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -match [Regex]::Escape($wt) } |
  Select-Object ProcessId, Name,
    @{n='cmd';e={ $_.CommandLine.Substring(0, [Math]::Min(100, $_.CommandLine.Length)) }}
```

Dropping the `Name='node.exe'` filter widens it to the usual non-node holders:
an editor indexing the tree (the pycharm MCP server in this setup runs one), a
file manager with it open, or a virus scanner mid-pass. An editor or a file
manager belongs to the user — report what holds it and ask, rather than ending
their process.

Where each scan is blind, measured on this machine: `/proc` lists only Git Bash
descendants, so a `node.exe` started from PowerShell with its cwd in the tree is
absent from it, while `Win32_Process` shows that same process without ever
revealing its cwd. A holder that is both started outside a shell and unnamed in
its own command line escapes both — the rename probe still proves the lock is
real, so say that plainly and hand it to the user rather than reporting the tree
as clean.
