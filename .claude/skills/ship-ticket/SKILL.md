---
name: ship-ticket
description: Push a built ticket and open its PR in this repo's format, with the migration and Members see lines, then file a follow-up issue for review notes left undone. Use when an `/implement` run's checks and review are done, or when asked to push and open a PR.
---

# Ship a ticket

A built ticket ends in a PR the owner merges. Getting there is the same five
steps every time, and none of them needs a decision from the human, so do not
stop to ask "push and open a PR?". Do every step yourself, then report. Merging
is never yours.

Stop and report instead of shipping when the build is not done: a check is red
for a reason you cannot fix, an acceptance line of the ticket is unmet, or the
human asked to see it before it goes up.

## 1. Commit and check

Commit anything still uncommitted on the ticket branch, then run
`npm run preflight` on the clean tree. It stamps the tree, so the push gate lets
the push straight through. A red check is a fix, not a reason to work around the
gate.

If `origin/main` has moved and touches the same files, merge it into the branch
(`git merge origin/main`) and re-run preflight. PRs are squash-merged, so a
merge commit on the branch costs nothing.

## 2. Push

```bash
git push -u origin HEAD
```

## 3. Open the PR

Open it ready, never as a draft: `gh pr create --base main --title ... --body-file ...`.

**Title.** What a reader of `git log` would want to know, in plain words, with the
ticket number at the end: `Tiebreaker Guesses card on the Reveal every week (#393)`.
No `feat:` prefix. Squash merge appends the PR number after it.

**Body.** It becomes the squash commit, so it is a briefing a reviewer reads in
a minute, not a log of the session. Lead with the closing line, then `##`
sections, dropping any with nothing to say:

```markdown
Closes #<ticket>.

## What changed
What a member or commissioner now sees or can do, then the code that does it.
Name a real symbol or path only where it carries the change.

## Judgment calls
Choices the ticket left open, with the one you made and why. The owner may
overrule these, so make each one easy to find.

## Not changed
What a reviewer might expect here that you left out on purpose.

## Verification
What you ran and what it showed: preflight, the tests you added, a screen you
checked with `verify-running-app`. Say plainly what you did not check, such as
"not checked on a phone".

## Review notes not acted on
Each `/code-review` finding you left, with the reason. Step 4 links the
follow-up issue here.

Migration: <see below>
Members see: <yes | behind FLAG | commissioners only | no>
```

**Migration line.** Run `git diff --name-only origin/main...HEAD -- drizzle/`.

- Nothing: `Migration: none.` If the change reshapes a jsonb column instead,
  add one sentence on how old rows still read.
- A new file: name it, and say:
  - Nothing to run for the merge. Vercel's preview and production builds both
    run `drizzle-kit migrate` (`npm run build`).
  - The shared development database behind `.env.local` needs
    `npm run migrate` before `next dev` runs this code, on this branch or on
    `main` after the merge.
  - Whether it is additive, so safe to apply before the merge, or it drops or
    renames something that code on `main` still reads.

  Never run the migration yourself. That database is shared.

**Members see line.** It is how the weekly changelog routine decides what to
announce, and it trusts the line exactly (#375). `yes` only if every member can
see the change today. A change behind an env flag is `behind <FLAG>`. Console
work is `commissioners only`. Refactors, tests, tooling and data with no screen
are `no`.

End the body with the PR attribution line the session's instructions give.

## 4. File the follow-up

A review note that names a concrete change you did not make (a duplicated
helper, a missing case, a cleanup) becomes one follow-up issue per PR. That
covers every such note in the PR. A note that only explains why the code is
already right stays in the PR and gets no issue.

Write it as a build ticket another agent can pick up cold, as #361 and #365 do:

- Title: the change, in plain words, such as "One helper for a game's bar colours by team id".
- Body: `## What`, naming the review it came from ("The review of #362 (PR #364) found…") with file and line for each spot, then `## How` if the shape is clear, then `## Done when`. Say "Behaviour must not change" when it is a refactor.
- Labels and assignee: copy the original ticket's owner (`owner:jonah` with assignee `jonahmabry`, or `owner:alex` with `AlexMabry`), plus `ready-for-agent`.
- Map: if the original ticket is a sub-issue of a map, add the follow-up to the same map. See `docs/agents/issue-tracker.md` for the sub-issue call.

Then edit the PR body so its review-notes section links the new issue.

## 5. Report

Reply with the PR URL and the follow-up issue, if you filed one. Then list what
is left for the human, and only that: merge, `npm run migrate` locally if there
was a migration, and any check you could not do yourself, such as a phone. Do
not watch CI or the preview after reporting unless asked.
