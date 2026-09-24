#!/usr/bin/env bash
# The four checks CLAUDE.md calls mandatory before work leaves the machine, run
# once and remembered.
#
#   npm run preflight           run them; on a clean tree, stamp it as passed
#   bash <this> --stamped       exit 0 if HEAD's tree is clean and stamped
#
# The push gate (preflight.sh) runs this unless the tree is already stamped, so
# checking before a push and the push itself cost one run, not two. The stamp is
# the tree hash, not the commit: re-committing identical content (an amended
# message) keeps it, and any change to the files, a rebase included, loses it.
# Only a passing run on a clean tree writes it, so skipping on it is as strict as
# running again.
#
# Order matters:
#   1. npx next build   -- the only local check that catches non-async "use server"
#                          exports, a "use client" file reaching a server-only module,
#                          and extra exports in a route.ts. Applies no migrations, so
#                          it is safe here (unlike `npm run build`). It also writes
#                          .next/types, without which typecheck reports a spurious
#                          `Cannot find name 'LayoutProps'` in a fresh worktree.
#   2. npm run typecheck
#   3. vitest, with one retry: the server-seam suites run PGlite in-process, and
#      under a full parallel run a test can hit the 20s timeout on CPU alone. A
#      retry passes those; a test that fails twice is still a failure.
#   4. npx eslint src
#
# Each step's output goes to a log; success prints one line, a failure prints the
# step and its log's tail. Exit 0 green, 1 a failed check.

set -u

root=$(git rev-parse --show-toplevel) || exit 1
cd "$root" || exit 1
stamp="$(git rev-parse --absolute-git-dir)/preflight-ok"

# The tree HEAD points at, but only when the working tree matches it exactly:
# untracked files count, since a new route builds whether it is committed or not.
clean_tree() {
  [ -z "$(git status --porcelain)" ] && git rev-parse 'HEAD^{tree}'
}

if [ "${1:-}" = "--stamped" ]; then
  tree=$(clean_tree) && [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$tree" ]
  exit $?
fi

before=$(clean_tree)
logs=$(mktemp -d "${TMPDIR:-/tmp}/preflight.XXXXXX")

step() {
  local name=$1
  shift
  local log="$logs/$name.log"
  if ! "$@" >"$log" 2>&1; then
    echo "preflight FAILED at: $name ($*)"
    echo "--- last 40 lines of $log ---"
    tail -n 40 "$log"
    exit 1
  fi
}

# `next build` holds an exclusive lock on the dist dir for its whole run and gives up
# after ~1s of contention, so two builds in one checkout collide -- two Claude
# sessions sharing a worktree is enough to cause it. A lost race says nothing about
# the diff, so wait for the lock rather than reporting a broken build.
build() {
  local lock_msg="Another next build process is already running"
  local log="$logs/build.log" attempt from
  for attempt in $(seq 1 24); do
    # `step` sends this function's output to the log; read back only what this
    # attempt wrote, so an earlier lock message cannot excuse a real failure.
    from=$(($(wc -l <"$log") + 1))
    npx next build && return 0
    tail -n "+$from" "$log" | grep -qF "$lock_msg" || return 1
    echo "build lock held; waiting ($attempt/24)"
    sleep 10
  done
  echo "another 'next build' held the build lock for the whole 240s, so the diff was never checked -- find it and run again"
  return 1
}

step build build
step typecheck npm run typecheck
step test npx vitest run --retry=1
step eslint npx eslint src

tests=$(grep -E '^ +Tests ' "$logs/test.log" | sed -E 's/^ +Tests +//')
after=$(clean_tree)
if [ -n "$before" ] && [ "$before" = "$after" ]; then
  echo "$after" >"$stamp"
  echo "preflight green: build, typecheck, test $tests, eslint; stamped tree ${after:0:7}, so the push gate will skip it"
else
  rm -f "$stamp"
  echo "preflight green: build, typecheck, test $tests, eslint; not stamped, the tree has uncommitted changes (or changed mid-run)"
fi

rm -rf "$logs"
