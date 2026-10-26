#!/usr/bin/env bash
# Warm a fresh worktree and prove it green, printing one line on success.
#
# Run from anywhere inside the worktree. Each step's output goes to a log in a
# temp directory, and only a failing step's tail is printed (the full log is kept
# and its path named). A clean warm-up costs the session one line of context
# instead of every install warning, route table and test file name -- output that
# would otherwise be re-read on every later turn.
#
# Usage: bash .claude/skills/new-worktree/warm.sh [--skip-checks | --quick]
#   --skip-checks  stop after the warm-up (install, env, build) and skip
#                  typecheck/test/eslint; the push gate runs all of them anyway.
#   --quick        install, env and `next typegen` only: what typecheck and the
#                  tests need, without a build or the checks. For agent:go
#                  builds, whose `npm run preflight` runs all of them once at
#                  the end; in the cloud, the full warm-up took 12 minutes.

set -u

root=$(git rev-parse --show-toplevel) || exit 1
cd "$root" || exit 1

logs=$(mktemp -d "${TMPDIR:-/tmp}/warm.XXXXXX")

step() {
  local name=$1
  shift
  local log="$logs/$name.log"
  if ! "$@" >"$log" 2>&1; then
    echo "warm-up FAILED at: $name ($*)"
    echo "--- last 40 lines of $log ---"
    tail -n 40 "$log"
    exit 1
  fi
}

step install npm ci --no-audit --no-fund --loglevel=error

common=$(git rev-parse --path-format=absolute --git-common-dir)
# A cloud clone has no .env.local to copy; build and tests run without one.
if [ -f "$common/../.env.local" ]; then
  step env cp "$common/../.env.local" .env.local
fi

if [ "${1:-}" = "--quick" ]; then
  step typegen npx next typegen
  echo "worktree warm (quick): install, env, typegen done (no build or checks)"
  rm -rf "$logs"
  exit 0
fi

step build npx next build

if [ "${1:-}" != "--skip-checks" ]; then
  step typecheck npm run typecheck
  step test npx vitest run --reporter=dot
  step eslint npx eslint src
  echo "worktree warm: install, env, build, typecheck, test, eslint all green"
else
  echo "worktree warm: install, env, build done (checks skipped)"
fi

rm -rf "$logs"
