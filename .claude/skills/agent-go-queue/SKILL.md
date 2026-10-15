---
name: agent-go-queue
description: After a PR merges, start the build of every `agent:go` ticket the merge unblocked. Use on the agent-go-queue routine, which fires in the cloud on every merged pull request.
---

# Release queued `agent:go` tickets

`agent-go` leaves `agent:go` on a ticket whose blockers are still open and
comments `Queued behind #<n>`. This skill runs when a PR merges into `main` and
starts the build of each queued ticket that is now free. It builds nothing
itself: one ticket per `agent-go` run keeps every build in its own session.

## 1. Find the queued tickets

List open issues labelled `agent:go`. None means stop: most merges free nothing.

## 2. Release the free ones

For each, read its native blocked-by dependencies
(`docs/agents/issue-tracker.md`). Skip it if any blocker is still open, or if
it is assigned (a build already claimed it).

For each ticket left, remove `agent:go` and add it again. The re-add is a fresh
"Issue: Labeled" event, made as `jonahmabry`, so `agent-go`'s gate accepts it.
Then comment `Unblocked by #<merged PR>; build starting.`

A merged PR closes its issue a moment after the merge event, so a blocker can
still read as open here. Re-read a blocker that the merged PR closes before
skipping on it.

**Done when** every open `agent:go` ticket with no open blocker has been
re-labelled and commented, and your final message lists them, or says none.
