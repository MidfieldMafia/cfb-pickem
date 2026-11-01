#!/bin/bash
# Removes the local branches and worktrees whose work has landed or is safe on
# the remote, and lists everything it kept and why (#504).
#
#   npm run prune-local              list what would go, change nothing
#   npm run prune-local -- --apply   remove it
#
# `.claude/hooks/prune-local.sh` runs `--apply` in the background at the start
# of every Claude session on the main checkout, so stale trees never pile up.
#
# `git branch --merged` misses most branches here because PRs squash-merge, so
# a branch is matched to its newest PR by head name instead. A branch goes when
# its tip is already contained in one of:
#   - origin/main;
#   - the head of its PR, once that PR has merged or closed (refs/pull/N/head,
#     fetched, so a branch pushed to after the local copy is still matched);
#   - origin/<branch>, when it has no PR (research and prototype branches,
#     whose remote copy the issue comments link to and which stay).
# Never removed: main, an open PR's branch, anything with commits that exist
# only here, a worktree with uncommitted or untracked files, a detached or
# locked worktree, and anything touched in the last $IDLE_DAYS days unless its
# PR has closed. The last guard keeps a fresh worktree branched from main (its
# tip is "in main") from vanishing under the session that just made it.
#
# Remote branches are left to GitHub's "Automatically delete head branches";
# `git fetch --prune` drops the tracking refs it has removed.
set -uo pipefail

APPLY=false
[ "${1:-}" = --apply ] && APPLY=true
IDLE_DAYS=${IDLE_DAYS:-3}

cd "$(git rev-parse --git-common-dir)/.." || exit 1
root=$(pwd -P)
now=$(date +%s)
idle_after=$((now - IDLE_DAYS * 86400))

command -v gh > /dev/null || { echo "prune-local: gh not found, nothing done"; exit 0; }
git fetch --quiet --prune origin || { echo "prune-local: fetch failed, nothing done"; exit 0; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# "<head>\t<number>\t<state>" for the newest PR of every head name.
gh pr list --state all --limit 2000 --json number,headRefName,state \
  --jq 'group_by(.headRefName)[] | max_by(.number) | [.headRefName, .number, .state] | @tsv' \
  > "$tmp/prs" || { echo "prune-local: gh pr list failed, nothing done"; exit 0; }

# "<branch>\t<worktree path>\t<locked>" for every worktree on a branch.
git worktree list --porcelain | awk '
  /^worktree / { path = substr($0, 10); branch = ""; locked = 0 }
  /^branch /   { branch = substr($0, 19) }
  /^locked/    { locked = 1 }
  /^$/         { if (branch != "") print branch "\t" path "\t" locked }
  END          { if (branch != "") print branch "\t" path "\t" locked }
' > "$tmp/worktrees"

# Fetch the head of every closed PR whose branch is still here, in one call.
refspecs=()
while read -r b; do
  line=$(awk -F'\t' -v b="$b" '$1 == b' "$tmp/prs")
  [ -n "$line" ] || continue
  IFS=$'\t' read -r _ n st <<< "$line"
  [ "$st" = OPEN ] || refspecs+=("+refs/pull/$n/head:refs/prune-local/pull/$n")
done < <(git for-each-ref --format='%(refname:short)' refs/heads)
[ ${#refspecs[@]} -eq 0 ] || git fetch --quiet origin "${refspecs[@]}" 2> /dev/null

contains() { git merge-base --is-ancestor "$1" "$2" 2> /dev/null; }

removed=0
: > "$tmp/kept"
keep() { printf '  %-44s %s\n' "$1" "$2" >> "$tmp/kept"; }

while read -r b; do
  [ "$b" = main ] && continue
  tip=$(git rev-parse "refs/heads/$b")

  wt="" locked=0
  line=$(awk -F'\t' -v b="$b" '$1 == b' "$tmp/worktrees")
  [ -n "$line" ] && IFS=$'\t' read -r _ wt locked <<< "$line"
  if [ "$wt" = "$root" ]; then keep "$b" "checked out in the main checkout"; continue; fi
  if [ "$locked" = 1 ]; then keep "$b" "worktree is locked"; continue; fi

  n="" st=""
  line=$(awk -F'\t' -v b="$b" '$1 == b' "$tmp/prs")
  [ -n "$line" ] && IFS=$'\t' read -r _ n st <<< "$line"

  if [ "$st" = OPEN ]; then keep "$b" "PR #$n is open"; continue; fi

  why=""
  if [ -n "$n" ] && contains "$tip" "refs/prune-local/pull/$n"; then
    why="PR #$n $(tr '[:upper:]' '[:lower:]' <<< "$st")"
  elif contains "$tip" origin/main; then
    why="in main"
  elif [ -z "$n" ] && git rev-parse -q --verify "refs/remotes/origin/$b" > /dev/null && contains "$tip" "origin/$b"; then
    why="pushed, no PR"
  elif [ -n "$n" ]; then
    keep "$b" "commits not in PR #$n"; continue
  else
    keep "$b" "no PR, commits only here"; continue
  fi

  # Fresh work is never pruned while its PR is still to come.
  if [ -z "$n" ]; then
    last=$(git log -1 --format=%ct "$tip")
    if [ -n "$wt" ]; then
      touched=$(git -C "$wt" log -g -1 --format=%ct HEAD 2> /dev/null || echo 0)
      [ "${touched:-0}" -gt "$last" ] && last=$touched
    fi
    if [ "$last" -gt "$idle_after" ]; then keep "$b" "used in the last $IDLE_DAYS days"; continue; fi
  fi

  if [ -n "$wt" ] && [ -d "$wt" ]; then
    if [ -n "$(git -C "$wt" status --porcelain 2> /dev/null)" ]; then
      keep "$b" "uncommitted changes in $wt"; continue
    fi
  fi

  if [ "$APPLY" = true ]; then
    if [ -n "$wt" ]; then
      if ! out=$(git worktree remove "$wt" 2>&1); then
        keep "$b" "worktree remove failed: $out"; continue
      fi
    fi
    git branch -D --quiet "$b" || { keep "$b" "branch delete failed"; continue; }
    echo "Removed $b${wt:+ and its worktree} ($why)."
  else
    echo "Would remove $b${wt:+ and its worktree $wt} ($why)."
  fi
  removed=$((removed + 1))
done < <(git for-each-ref --format='%(refname:short)' refs/heads)

git worktree prune
git for-each-ref --format='%(refname)' refs/prune-local | while read -r ref; do git update-ref -d "$ref"; done

kept=$(grep -c . "$tmp/kept")
if [ "$kept" -gt 0 ]; then
  echo "Kept:"
  cat "$tmp/kept"
fi
verb=$([ "$APPLY" = true ] && echo "Removed" || echo "Would remove")
echo "prune-local: $verb $removed branch(es); kept $kept."
