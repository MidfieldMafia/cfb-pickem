#!/usr/bin/env bash
# PreToolUse(Bash) gate for `git push`.
#
# Push is the moment a bad diff reaches CI and the Vercel preview, so that is where
# the gate sits -- commits stay instant, including throwaway WIP ones.
#
# Runs the checks that CLAUDE.md calls mandatory before work leaves the machine,
# in this order:
#   1. npx next build   -- the only local check that catches non-async "use server"
#                          exports, a "use client" file reaching a server-only module,
#                          and extra exports in a route.ts. Applies no migrations, so
#                          it is safe here (unlike `npm run build`).
#   2. npm run typecheck
#   3. npm run test
#   4. npx eslint src
# Build runs first on purpose: it writes .next/types, without which typecheck reports
# a spurious `Cannot find name 'LayoutProps'` in a fresh worktree.
#
# A fifth, non-blocking check follows: Neon branch capacity (see below). It never
# gates the push -- only 1-4 do.
#
# Exit 0 lets the git command through; exit 2 blocks it and hands the reason to Claude.

set -u

payload=$(cat)

# Decide whether to gate at all, and find the session's working directory.
# Commits, and read-only git commands, pass straight through.
#
# This asks whether a segment of the command *invokes* `git push`, rather than
# whether the words "git" and "push" both appear. Matching the raw string got this
# wrong in both directions: it blocked read-only commands that merely named this
# repo's own `chore/push-gate-and-worktree-skills` branch, and it let a real
# `git -C <path> push` through, because the subcommand is not adjacent to `git`.
#
# The script lives in a function rather than directly inside `$(...)`: bash 3.2
# (macOS's /bin/bash) does not parse the inside of a command substitution, it
# scans it for a matching paren while honouring quotes, so a stray apostrophe or
# backtick in the JavaScript turned the rest of this file into an unterminated
# string. A function body goes through the real parser.
decide_target() {
  PAYLOAD="$payload" node <<'JS'
const p = (() => {
  try { return JSON.parse(process.env.PAYLOAD || "{}"); } catch { return {}; }
})();
const cmd = (p.tool_input && p.tool_input.command) || "";

// git's own options that swallow the following token, so we do not read their
// value as the subcommand.
const OPTS_WITH_VALUE = new Set([
  "-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path",
  "--super-prefix", "--config-env",
]);
// Wrappers that can precede the real command word.
const PREFIXES = /^(?:sudo|command|time|env|nohup|exec|builtin)$/;

const unquote = (t) => t.replace(/^["\x27]|["\x27]$/g, "");

function invokesPush(segment) {
  // Command substitution and grouping punctuation are not part of the command word.
  const seg = segment.replace(/^[\s({]+/, "");
  const tokens = seg.trim().match(/(?:[^\s"\x27]+|"[^"]*"|\x27[^\x27]*\x27)+/g) || [];
  let i = 0;
  while (i < tokens.length &&
         (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i]) || PREFIXES.test(unquote(tokens[i])))) {
    i++;
  }
  if (i >= tokens.length) return false;
  const cmdWord = unquote(tokens[i]).replace(/\.exe$/i, "");
  // Basename, without writing a path separator into a regex: an escaped backslash
  // does not survive every way this file gets written, and if this expression
  // throws, the hook fails open and gates nothing.
  const BACKSLASH = String.fromCharCode(92);
  const sep = Math.max(cmdWord.lastIndexOf("/"), cmdWord.lastIndexOf(BACKSLASH));
  if ((sep < 0 ? cmdWord : cmdWord.slice(sep + 1)) !== "git") return false;
  for (i++; i < tokens.length; i++) {
    const t = unquote(tokens[i]);
    if (t === "push") return true;
    if (!t.startsWith("-")) return false;      // some other subcommand
    if (OPTS_WITH_VALUE.has(t)) i++;           // skip its value too
  }
  return false;
}

// Operators that start a new command. `&&` and `||` are listed before the single
// character forms so the two-character operators win at the same position.
// Closing brackets end one too, so that `$(git push)` does not leave the
// subcommand glued to a paren as `push)`.
const segments = cmd.split(/\r?\n|&&|\|\||;|\||&|\$\(|`|\)|\}/);

if (!segments.some(invokesPush)) { console.log("SKIP"); }
else { console.log(p.cwd || process.cwd()); }
JS
}

if ! target=$(decide_target); then
  # The decision script died (no node on PATH, a syntax error introduced while
  # editing this file). The old `|| exit 0` here made that failure silently
  # disable the gate, which is the one outcome worth avoiding: a needless 10s
  # build costs far less than an ungated push. So fall back to the coarse check
  # and let it err toward gating.
  if printf '%s' "$payload" | grep -qE 'git[^"]*push'; then
    echo "NOTE: preflight could not parse the command, so it is gating on a coarse match." >&2
    target=$(pwd)
  else
    target=SKIP
  fi
fi

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

# `next build` holds an exclusive lock on the dist dir for its whole run and gives up
# after ~1s of contention, so two builds in one checkout collide -- two Claude
# sessions sharing a worktree is enough to cause it. A lost race says nothing about
# the diff, so wait for the lock rather than reporting a broken build.
lock_msg="Another next build process is already running"
lock_delay=10
lock_attempts=24

attempt=1
while :; do
  if npx next build >"$log" 2>&1; then
    break
  fi
  if ! grep -qF "$lock_msg" "$log"; then
    echo "BLOCKED: 'npx next build' failed, so this push would break the Vercel build. Fix it before pushing. Last 40 lines:" >&2
    tail -n 40 "$log" >&2
    exit 2
  fi
  if [ "$attempt" -ge "$lock_attempts" ]; then
    echo "BLOCKED: another 'next build' held the build lock for the whole $((lock_delay * lock_attempts))s this waited, so the diff was never checked. Nothing here says it is broken -- find the build that is holding it (another session in this checkout, or a stray process) and push again." >&2
    exit 2
  fi
  attempt=$((attempt + 1))
  sleep "$lock_delay"
done

if ! npm run typecheck >"$log" 2>&1; then
  echo "BLOCKED: 'npm run typecheck' failed. Fix the type errors before pushing. Last 40 lines:" >&2
  tail -n 40 "$log" >&2
  exit 2
fi

if ! npm run test >"$log" 2>&1; then
  echo "BLOCKED: 'npm run test' failed. Fix the failing tests before pushing. Last 40 lines:" >&2
  tail -n 40 "$log" >&2
  exit 2
fi

if ! npx eslint src >"$log" 2>&1; then
  echo "BLOCKED: 'npx eslint src' failed. Fix the lint errors before pushing. Last 40 lines:" >&2
  tail -n 40 "$log" >&2
  exit 2
fi

# Neon branch capacity -- advisory only, never blocks the push.
#
# A full push can still be a good push while Neon has no room for another preview
# branch: the cap isn't something this diff caused or can fix, so gating on it would
# repeat the exact "preview red = my diff is broken" confusion the
# neon-branch-limit-broke-previews memory documents. This just surfaces the number
# before that confusion has a chance to start.
#
# Requires NEON_API_KEY and NEON_PROJECT_ID in .env.local; silently skipped if either
# is missing (e.g. a machine without Neon web access) so it never breaks the gate.
strip_quotes() {
  local v="$1"
  v="${v%\"}"; v="${v#\"}"
  v="${v%\'}"; v="${v#\'}"
  printf '%s' "$v"
}

if [ -f .env.local ]; then
  neon_key=$(strip_quotes "$(grep -m1 '^NEON_API_KEY=' .env.local | cut -d= -f2-)")
  neon_project=$(strip_quotes "$(grep -m1 '^NEON_PROJECT_ID=' .env.local | cut -d= -f2-)")
  if [ -n "$neon_key" ] && [ -n "$neon_project" ]; then
    neon_resp=$(curl -sS --max-time 10 \
      -H "Authorization: Bearer $neon_key" \
      -H "Accept: application/json" \
      "https://console.neon.tech/api/v2/projects/$neon_project/branches" 2>/dev/null)
    branch_count=$(printf '%s' "$neon_resp" | node -e '
      let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
        try { const j=JSON.parse(s); console.log(Array.isArray(j.branches)?j.branches.length:""); }
        catch { console.log(""); }
      });' 2>/dev/null)
    # Free-tier cap per docs/research/vercel-neon-nextjs-constraints.md (SS3): 10
    # branches per project. Not fetched from the API -- the project endpoint doesn't
    # return the plan limit, so this is a documented constant, not a live figure.
    neon_limit=10
    if [ -n "$branch_count" ]; then
      if [ "$branch_count" -ge "$neon_limit" ]; then
        echo "NOTE: Neon is at its branch cap ($branch_count/$neon_limit). The next preview deployment may fail to provision a database for reasons unrelated to this diff -- see [[neon-branch-limit-broke-previews]] and ping Jonah to clear old branches." >&2
      elif [ "$branch_count" -ge $((neon_limit - 2)) ]; then
        echo "NOTE: Neon branch usage is $branch_count/$neon_limit -- close to the free-tier cap. A preview may fail to provision soon." >&2
      fi
    fi
  fi
fi

exit 0
