# Finding what still holds a worktree

Reached from a `STILL LOCKED` probe on Windows, or a delete that fails with
`Device or resource busy` anywhere.

A **working directory is not part of a command line**. A process that only
*sits* in the tree never shows up in a command-line scan, and often the only
match is your own scanning shell, which looks like "nothing holds it". Real case:
an `until gh pr checks 62 ...; do sleep 20; done` loop, started with its cwd
inside a worktree, outlived the worktree and blocked the delete, and nothing in
its command line named the tree.

Kill the **parent** and rescan. A `sleep` child gets a new pid every loop, so
chasing the child never converges.

## Windows

Run **both** scans. Each is blind where the other sees.

Working directories, from Git Bash. This sees every Git Bash descendant,
including ones started outside the tree:

```bash
wt=<worktree path fragment>
for p in /proc/[0-9]*; do
  c=$(readlink "$p/cwd" 2>/dev/null)
  case "$c" in *$wt*) echo "$p winpid=$(cat $p/winpid 2>/dev/null) $(tr '\0' ' ' < $p/cmdline | cut -c1-80)";; esac
done
```

Command lines, from PowerShell. This sees processes started outside a shell,
without their cwd:

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -match [Regex]::Escape($wt) } |
  Select-Object ProcessId, Name,
    @{n='cmd';e={ $_.CommandLine.Substring(0, [Math]::Min(100, $_.CommandLine.Length)) }}
```

With no `node.exe` filter, this also catches the usual non-node holders: an
editor indexing the tree (the pycharm MCP server here runs one), a file manager,
or a virus scanner mid-pass. An editor or file manager belongs to the user:
report it and ask before ending it.

A holder started outside a shell and unnamed in its own command line escapes
both scans. The rename probe still proves the lock is real, so report it as
locked with the holder unknown, and hand it to the user.

## macOS and Linux

`lsof` sees open files and working directories together:

```bash
wt='<absolute path to the worktree>'
lsof -a -d cwd +D "$wt"      # processes sitting in the tree (the fast question)
lsof +D "$wt"                # anything with a file open under it
pgrep -af "$wt"              # anything naming it on its command line
```

`+D` walks the whole tree, so it is slow across a warm `node_modules`.
