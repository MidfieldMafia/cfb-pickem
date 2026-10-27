#!/usr/bin/env bash
# PreToolUse(Bash) gate for `git push`.
#
# Push is the moment a bad diff reaches CI and the Vercel preview, so that is where
# the gate sits -- commits stay instant, including throwaway WIP ones.
#
# Runs the checks that CLAUDE.md calls mandatory before work leaves the machine --
# next build, typecheck, test, eslint -- through preflight-checks.sh, which holds
# their order and reasons. A tree that `npm run preflight` already passed, clean
# and unchanged since, is stamped, and the gate lets it through without running
# them again.
#
# A fifth, non-blocking check follows: Neon branch capacity (see below). It never
# gates the push -- only the four checks do.
#
# Exit 0 lets the git command through; exit 2 blocks it and hands the reason to Claude.

set -u

payload=$(cat)

# Decide whether to gate at all, and find the directory the push runs in.
# Commits, read-only git commands, and text that only mentions a push (a heredoc
# body, a quoted message) pass straight through. decide-target.cjs holds the
# parsing and why; src/push-gate.test.ts holds its cases.
#
# Next to this file, so the gate uses the main checkout's copy even in a worktree
# cut before the script existed.
decide_target() {
  PAYLOAD="$payload" node "$(dirname "${BASH_SOURCE[0]}")/decide-target.cjs"
}

if ! target=$(decide_target); then
  # The decision script died (no node on PATH, a syntax error introduced while
  # editing it, a command it could not read). The old `|| exit 0` here made that
  # failure silently disable the gate, which is the one outcome worth avoiding:
  # a needless 10s build costs far less than an ungated push. So fall back to
  # the coarse check and let it err toward gating.
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

# A branch whose every change sits under docs/ (a prototype captured to
# docs/prototypes/, research, an ADR) gives the four checks nothing to read, so
# it goes through without them and without node_modules: capturing a canvas
# used to cost an `npm ci` and a full build.
#
# The hook runs before the whole command, so a command that commits and pushes
# in one go has not committed yet when it is judged: reading only HEAD's commits
# saw an empty diff and sent four of five research pushes to `npm ci` (#517).
# So it reads everything the push could carry: the branch's commits since
# origin/main, staged and unstaged changes, and untracked files. Nothing there,
# or no origin/main to compare with, falls through to the full gate.
docs_only() {
  local branch worktree untracked changed
  branch=$(git -c core.quotePath=false diff --name-only origin/main...HEAD 2>/dev/null) || return 1
  worktree=$(git -c core.quotePath=false diff --name-only HEAD 2>/dev/null) || return 1
  untracked=$(git -c core.quotePath=false ls-files --others --exclude-standard 2>/dev/null) || return 1
  changed=$(printf '%s\n%s\n%s\n' "$branch" "$worktree" "$untracked" | grep -v '^$')
  [ -n "$changed" ] && ! printf '%s\n' "$changed" | grep -qv '^docs/'
}

if docs_only; then
  exit 0
fi

if [ ! -d node_modules ]; then
  echo "BLOCKED: no node_modules in $target -- run 'npm ci' first. A fresh worktree does not share it, and every server-seam suite and the build fail without it. A push whose every change is under docs/ skips the gate and needs none, but the gate only sees files that exist before the command runs: write and commit them first, then push as a separate command." >&2
  exit 2
fi

# Next to this file, like decide-target.cjs.
checks="$(dirname "${BASH_SOURCE[0]}")/preflight-checks.sh"

if bash "$checks" --stamped; then
  : # Passed on this exact tree already; nothing to rerun.
elif ! out=$(bash "$checks" 2>&1); then
  echo "BLOCKED: a check failed, so this push would break CI or the Vercel build. Fix it before pushing." >&2
  printf '%s\n' "$out" >&2
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
