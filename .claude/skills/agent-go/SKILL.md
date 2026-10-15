---
name: agent-go
description: Build the issue that was just labelled `agent:go`, from gate check to open PR. Use on the agent:go routine, which fires in the cloud on every issue label change.
---

# Build an `agent:go` issue

Jonah applies `agent:go` to a ticket that should be built now; `ready-for-agent` only
means the ticket is fully written. A cloud routine fires on GitHub's "Issue:
Labeled" event, filtered on `agent:go`, and runs this skill unattended. Nobody
is watching, so every refusal is a comment on the issue, never a question.

## 1. Gate

The routine's label filter matches the labels an issue _has_, so any label
change on an issue that still carries `agent:go` fires it again. Check, in
order, and stop at the first failure:

1. The issue still has `agent:go`. If not, another run has claimed it: stop
   silently.
2. `agent:go` was added by `jonahmabry`, per the issue's events.
3. The issue has no assignee and no open PR that closes it.
4. Every issue it is blocked by (native dependencies, `docs/agents/issue-tracker.md`)
   is closed.

On a failure after 1, comment which check failed and why, remove `agent:go`,
and stop. A blocked ticket's comment names its open blockers.

**Done when** all four pass, or the issue carries a comment saying why not.

## 2. Claim it

Remove `agent:go`, assign the issue to `jonahmabry`, and comment that a build
has started. Removing the label first is what makes check 1 stop a duplicate run.

## 3. Worktree

Follow `new-worktree`: a branch named for the issue (`<slug>-<number>`), cut
from `origin/main`, warmed and green before any code. The clone has no
`.env.local`, so `warm.sh` skips the env step; build and tests need no secrets.

**Done when** `warm.sh` prints `all green`. Every later change happens in that
worktree.

## 4. Build

Read the ticket, its parent map, and any spec, design or research it links.
Then invoke `/mattpocock-skills:implement` with the issue URL, inside the
worktree, and follow it, including its `/code-review` pass. CLAUDE.md's checks
apply as written: `npx next build` when the diff touches a `"use server"` file,
a route handler or the client/server boundary; never `npm run build`.

There is no database here, so `verify-running-app` cannot run. List whatever
renders under **Not verified** in the PR instead.

## 5. Ship

Commit, run `npm run preflight`, push the branch, and open a PR that closes the
issue, written with `/mattpocock-skills:pr`, with its `Members see:` line. Never merge.

If the build cannot finish, push what exists as a draft PR and comment on the
issue with what stopped it and what decision it needs from Jonah.

**Done when** the issue links an open PR, ready or draft, and its last comment
says which.
