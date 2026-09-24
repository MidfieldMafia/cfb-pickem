#!/usr/bin/env bash
# Warm a fresh worktree and prove it green, printing one line on success.
#
# Run from anywhere inside the worktree. Each step's output goes to a log in a
# temp directory, and only a failing step's tail is printed (the full log is kept
# and its path named). A clean warm-up costs the session one line of context
# instead of every install warning, route table and test file name -- output that
# would otherwise be re-read on every later turn.
#
# Usage: bash .claude/skills/new-worktree/warm.sh [--skip-checks]
#   --skip-checks  stop after the warm-up (install, env, build) and skip
#                  typecheck/test/eslint; the push gate runs all of them anyway.

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
step env cp "$common/../.env.local" .env.local

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
