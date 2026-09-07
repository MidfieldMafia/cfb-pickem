---
name: remove-worktree
description: Retire a finished worktree, releasing any file handles that block its deletion. Use after a PR merges, or when `git worktree remove` fails with "Directory not empty".
---

# Retire a worktree

Removal is four commands on macOS and Linux. On Windows a directory cannot be
deleted while any process holds an open **handle** inside it, so a running dev
server turns those four commands into a stranded half-removed tree.

Read that failure mode before step 1, because it decides the order:

> `git worktree remove` deregisters the worktree **first**, then deletes the
> files. When the delete fails, git has already forgotten the worktree — so
> `git worktree list` goes quiet while the directory sits there full of files.
> A failed remove is not a no-op.

So release the handles *before* calling remove, rather than calling remove and
reacting. Step 3 is how; step 6 recovers a tree already in that state.

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

On Windows a shell parked in the worktree is itself a handle, and the removal
fails. Leave first:

```bash
cd "$(git rev-parse --git-common-dir)/.."
```

## 3. Release the handles — Windows only

**On macOS or Linux, skip to step 5.** Unlinking a file that a process still
has open is allowed there, so a running dev server never blocks the delete. Stop
your server anyway if it is running in this tree — it holds the port and keeps
writing into a directory you are deleting — then go to step 5.

On Windows, one `next dev` is **four** node processes, and the one listening on
the port is only one of them. Measured on this machine:

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

## 4. Probe for the lock — Windows only

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

## 5. Remove

```bash
git worktree remove .claude/worktrees/<name>
git worktree prune
git branch -d <branch>
```

`git branch -d` refuses a branch that is not merged, a useful second opinion on
step 1. Reaching for `-D` overrides that — say so out loud first.

Confirm with `git worktree list` and `ls .claude/worktrees/`. Both should show
the worktree gone.

## 6. Recover a stranded tree

The signature is a directory under `.claude/worktrees/` that `git worktree list`
does not mention: a failed remove already dropped the registration. Git will not
help you here — `git worktree remove` reports the path is not a worktree, and
`prune` has nothing left to prune.

Release the handles (step 3), confirm `UNLOCKED` (step 4), then delete the
directory yourself and reconcile git:

```bash
rm -rf .claude/worktrees/<name>
git worktree prune
git branch -d <branch>          # the branch outlives the worktree
```

Order matters: prune once the files are actually gone.

## 7. When the probe stays locked

Something the path scan cannot see holds it. **A working directory is not part
of a command line**, so a process merely *sitting* in the worktree is invisible
to step 3 — and the only thing matching the path is often your own scanning
shell, which reads as a reassuring "nothing holds it" while the delete keeps
failing.

That is a real case, not a hypothetical: a `until gh pr checks 62 ...; do sleep
20; done` loop, launched with its cwd inside a worktree, outlived that worktree
and blocked the delete with `Device or resource busy`. Nothing in its command
line named the tree.

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

Kill the **parent** and rescan. A `sleep` child rotates its pid on every loop,
so chasing the child never converges.

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

Where each scan is blind, measured on this machine: `/proc` lists only
Git Bash descendants, so a `node.exe` started from PowerShell with its cwd in
the tree is absent from it, while `Win32_Process` shows that same process
without ever revealing its cwd. A holder that is both started outside a shell
and unnamed in its own command line escapes both — the rename probe still proves
the lock is real, so say that plainly and hand it to the user rather than
reporting the tree as clean.

The macOS equivalent of the whole step: `lsof +D <worktree>`, which reports cwd
and open files together.
