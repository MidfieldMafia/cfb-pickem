#!/usr/bin/env bash
# PreToolUse(Bash) gate for `git push`.
#
# Push is the moment a bad diff reaches CI and the Vercel preview, so that is where
# the gate sits -- commits stay instant, including throwaway WIP ones.
#
# Runs the two local checks that CLAUDE.md calls mandatory before work leaves the
# machine, in this order:
#   1. npx next build  -- the only local check that catches non-async "use server"
#                         exports, a "use client" file reaching a server-only module,
#                         and extra exports in a route.ts. Applies no migrations, so
#                         it is safe here (unlike `npm run build`).
#   2. npm run typecheck
# Build runs first on purpose: it writes .next/types, without which typecheck reports
# a spurious `Cannot find name 'LayoutProps'` in a fresh worktree.
#
# Exit 0 lets the git command through; exit 2 blocks it and hands the reason to Claude.

set -u

payload=$(cat)

# Decide whether to gate at all, and find the session's working directory.
# Commits, and read-only git commands, pass straight through.
target=$(printf '%s' "$payload" | node -e '
let s = "";
process.stdin.on("data", d => (s += d)).on("end", () => {
  let p = {};
  try { p = JSON.parse(s); } catch {}
  const cmd = (p.tool_input && p.tool_input.command) || "";
  if (!/\bgit\b[^\r\n]*\bpush\b/.test(cmd)) { console.log("SKIP"); return; }
  console.log(p.cwd || process.cwd());
});
') || exit 0

[ "$target" = "SKIP" ] && exit 0
cd "$target" 2>/dev/null || true

# Only gate repos that actually build with Next, so this stays safe if it is ever
# installed in user scope and fires in an unrelated project.
if ! node -e 'const p=require(process.cwd()+"/package.json");process.exit(((p.dependencies||{}).next||(p.devDependencies||{}).next)?0:1)' 2>/dev/null; then
  exit 0
fi

if [ ! -d node_modules ]; then
  echo "BLOCKED: no node_modules in $target -- run 'npm ci' first. A fresh worktree does not share it, and every server-seam suite and the build fail without it." >&2
  exit 2
fi

# BSD mktemp (macOS) needs a template; GNU accepts one too, so always pass it.
log=$(mktemp "${TMPDIR:-/tmp}/preflight.XXXXXX")
trap 'rm -f "$log"' EXIT

if ! npx next build >"$log" 2>&1; then
  echo "BLOCKED: 'npx next build' failed, so this push would break the Vercel build. Fix it before pushing. Last 40 lines:" >&2
  tail -n 40 "$log" >&2
  exit 2
fi

if ! npm run typecheck >"$log" 2>&1; then
  echo "BLOCKED: 'npm run typecheck' failed. Fix the type errors before pushing. Last 40 lines:" >&2
  tail -n 40 "$log" >&2
  exit 2
fi

exit 0
