#!/usr/bin/env bash
# SessionStart hook: prunes stale local branches and worktrees (#504).
#
# GitHub merges a PR without this machine hearing about it, and a session that
# ends without the `remove-worktree` skill leaves its tree behind: by 2026-10-26
# that was 105 branches and 18 worktrees. So every session on the main checkout
# starts a sweep instead, in the background so the session never waits on the
# network. scripts/prune-local.sh holds the rule for what goes and what stays.
#
# It prints the summary of the previous sweep, so a kept branch that needs a
# human (unpushed commits, uncommitted changes) shows up in the session.
#
# Skipped in a worktree, where a sweep could remove a sibling mid-use for no
# gain, and in the cloud, where a checkout has no stale trees to find.
set -u

[ "${CLAUDE_CODE_REMOTE:-}" = true ] && exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" 2> /dev/null || exit 0
[ "$(git rev-parse --git-dir 2> /dev/null)" = .git ] || exit 0
[ -x scripts/prune-local.sh ] || exit 0

log=.git/prune-local.log
if [ -s "$log" ]; then
  kept=$(sed -n '/^Kept:/,/^prune-local:/p' "$log" | grep -v '^prune-local:')
  summary=$(tail -1 "$log")
  echo "Last branch sweep: ${summary#prune-local: }"
  [ -n "$kept" ] && printf '%s\n' "$kept" | grep -v 'PR #[0-9]* is open\|used in the last'
fi

# The whole subshell is detached from the hook's stdout, or the session would
# wait for the sweep to close the pipe.
(bash scripts/prune-local.sh --apply > "$log.new" 2>&1 && mv "$log.new" "$log") < /dev/null > /dev/null 2>&1 &
exit 0
