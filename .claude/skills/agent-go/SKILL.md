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

On a failure of 2 or 3, comment which check failed and why, remove `agent:go`,
and stop.

A failure of 4 **queues** the ticket instead: leave `agent:go` on, comment
`Queued behind #<n>, #<m>` naming the open blockers, and stop. When a blocker's
PR merges, the `agent-go-queue` routine re-applies the label and this one fires
again. A queued ticket also re-fires on every other label change, so if the
last `Queued behind` comment already names the same open blockers, stop
without commenting.

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

The routine's prompt starts with `/mattpocock-skills:implement`, so its
instructions are already in your context: that skill cannot be invoked by the
model, only typed, which is why the prompt carries it. Follow them inside the
worktree, after steps 1–3, including the `tdd` and `code-review` passes. Read
the ticket, its parent map, and any spec, design or research it links first.
Where implement says to ask, there is nobody to answer: make the call the
ticket and docs support and record it under **Judgment calls** in the PR, or,
when nothing supports either way, stop and ship a draft (step 6).

CLAUDE.md's checks apply as written: `npx next build` when the diff touches a
`"use server"` file, a route handler or the client/server boundary; never
`npm run build`.

## 5. Check it on a screen

Any diff that renders gets read on a served screen, signed in, before it ships.
`scripts/agent-db.ts` gives the run its own database: a branch of the
`slate-agents` Neon project with a fake league, which `verify-running-app`
then reads like any other.

The cloud reaches the internet only through `HTTPS_PROXY`, which Node's own
`fetch` ignores unless told, and both `agent-db` and the app's database driver
use it. Export the switch first, in the same shell as everything after:

```bash
export NODE_USE_ENV_PROXY=1
npm run agent-db -- up <issue number>   # branch, .env.local, migrate, seed
npm run dev -- -p 3200                  # in the background
S=$(npm run -s agent-db -- session Casey)
```

`up` prints the fake members and the state each is in: Casey is the
commissioner and organizer, Jordan and Riley have every Week 7 pick in, Morgan
some, Taylor and Sam none, and Drew has not finished `/welcome`. Week 6 is
final; Week 7 is open with its Deadline three days out. Set up any other state
the check needs with SQL against the branch: it is yours and is deleted after.

Then follow `verify-running-app` from step 4 with `$S` as the cookie. For step
5's browser, Chromium is at `/opt/pw-browsers/chromium`; downloading another is
blocked. Wait for `load` and a few seconds, never `networkidle0`: Chromium's
own calls to Google are refused by the proxy and keep the network busy until
the navigation times out. Look at a 390px screenshot of every screen the diff
touched, and the design it was built from when the ticket links one.

What the cloud cannot show:

- `/console/slate` calls CollegeFootballData as it renders and there is no key
  here, so it errors. Member screens do not: their feed refresh is caught.
- A session cookie skips the Magic Link landing, which is what sends an
  unwelcomed member to `/welcome`, so check Drew's state at `/welcome` itself.

**Always** run `npm run agent-db -- down` when the check ends, failed or not.
In the PR, list what you checked and what each screen showed under **Checked
on screen**, and anything you could not reach under **Not verified**.

**Done when** every screen the diff touched has been read signed in, and the
branch is deleted.

## 6. Ship

Commit, run `npm run preflight`, push the branch, and open a PR that closes the
issue, written with `/mattpocock-skills:pr`, with its `Members see:` line. Never merge.

If the build cannot finish, push what exists as a draft PR and comment on the
issue with what stopped it and what decision it needs from Jonah.

**Done when** the issue links an open PR, ready or draft, and its last comment
says which.
