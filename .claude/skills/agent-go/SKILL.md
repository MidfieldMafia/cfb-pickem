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

## 4. Database, and the "before" screenshots

Any ticket that renders gets read on a served screen, signed in, before and
after the change. `scripts/agent-db.ts` gives the run its own database for the
whole build: a branch of the `slate-agents` Neon project with a fake league,
which `verify-running-app` then reads like any other.

The cloud reaches the internet only through `HTTPS_PROXY`, which Node's own
`fetch` ignores unless told, and both `agent-db` and the app's database driver
use it. Export the switch first, in the same shell as everything after:

```bash
export NODE_USE_ENV_PROXY=1
npm run agent-db -- up <issue number>   # branch, .env.local, migrate, seed
npm run dev -- -p 3200                  # in the background
export S=$(npm run -s agent-db -- session Casey)
```

`up` prints the fake members and the state each is in: Casey is the
commissioner and organizer, Jordan and Riley have every Week 7 pick in, Morgan
some, Taylor and Sam none, and Drew has not finished `/welcome`. Week 6 is
final; Week 7 is open with its Deadline three days out. Set up any other state
the screens need with SQL against the branch: it is yours and is deleted after.

Before writing any code, screenshot every existing screen the ticket will
change, in the state that shows the change, as the member who would see it:

```bash
PPT="$HOME/.cache/slate-browser"
[ -f "$PPT/.installed" ] || { npm i puppeteer-core --prefix "$PPT" --no-audit --no-fund && touch "$PPT/.installed"; }
node .claude/skills/agent-go/shoot.cjs --label before --out /tmp/shots /picks /leaderboard
```

A path takes its own key as `<key>=<path>` (`field-card=/live?week=7`) when
the URL alone would not say which state it shows; the after shot must use the
same key. A screen the ticket creates has no before. Write down the keys,
member and state: step 6 repeats them exactly. Stop the dev server, and keep
the database: it lives until step 6.

**Done when** `/tmp/shots` holds a `before--<key>.png` for every existing
screen the ticket changes, or the ticket changes none.

## 5. Build

The routine's prompt starts with `/mattpocock-skills:implement`, so its
instructions are already in your context: that skill cannot be invoked by the
model, only typed, which is why the prompt carries it. Follow them inside the
worktree, after steps 1–4, including the `tdd` and `code-review` passes. Read
the ticket, its parent map, and any spec, design or research it links first.
Where implement says to ask, there is nobody to answer: make the call the
ticket and docs support and record it under **Judgment calls** in the PR, or,
when nothing supports either way, stop and ship a draft (step 7).

CLAUDE.md's checks apply as written: `npx next build` when the diff touches a
`"use server"` file, a route handler or the client/server boundary; never
`npm run build`.

## 6. Check it on a screen

Start the dev server again and follow `verify-running-app` from step 4 with
`$S` as the cookie. For step 5's browser, Chromium is at
`/opt/pw-browsers/chromium`; downloading another is blocked. Wait for
`domcontentloaded` and a few seconds, never `networkidle0`: Chromium's own
calls to Google are refused by the proxy and keep the network busy until the
navigation times out. Measure what the diff changed, and compare each screen
with the design it was built from when the ticket links one.

Then take the after shots: every key from step 4 with the same member and
state, plus each screen the ticket created. A state no data reaches (a game
under way, a void) is rendered through a throwaway route, as
`verify-running-app/browser.md` describes; screenshot it there, then delete it.

```bash
node .claude/skills/agent-go/shoot.cjs --label after --out /tmp/shots /picks /leaderboard
npm run agent-shots -- <issue number> /tmp/shots   # prints the PR's Screenshots section
```

Read every after shot before publishing it: a screenshot of an error page or a
half-loaded screen is a finding, not an illustration. `agent-shots` commits the
PNGs to the `agent-screenshots` branch, which never merges, and prints a
before/after table to paste into the PR. The repository is public and so are
these images, which is why it refuses to run without an `agent-db` branch:
never screenshot any other database.

What the cloud cannot show:

- `/console/slate` calls CollegeFootballData as it renders and there is no key
  here, so it errors. Member screens do not: their feed refresh is caught.
- A session cookie skips the Magic Link landing, which is what sends an
  unwelcomed member to `/welcome`, so check Drew's state at `/welcome` itself.

Stop the dev server, then **always** run `npm run agent-db -- down`, failed or
not. In the PR, put the Screenshots section, list what you checked and what
each screen showed under **Checked on screen**, and anything you could not
reach under **Not verified**.

**Done when** every screen the diff touched has been read signed in, its
before and after are in the PR, and the branch is deleted.

## 7. Ship

Commit, run `npm run preflight`, push the branch, and open a PR that closes the
issue, written with `/mattpocock-skills:pr`, with its `Members see:` line and
the Screenshots section from step 6. Never merge.

If the build cannot finish, push what exists as a draft PR, run `agent-db down`
if it is still up, and comment on the issue with what stopped it and what
decision it needs from Jonah.

**Done when** the issue links an open PR, ready or draft, and its last comment
says which.
