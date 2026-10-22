---
name: agent-go
description: Build the issue that was just labelled `agent:go`, from gate check to open PR. Use on the agent:go routine, which fires in the cloud on every issue label change.
---

# Build an `agent:go` issue

Jonah applies `agent:go` to a ticket that should be built now; `ready-for-agent` only
means the ticket is fully written. A cloud routine fires on GitHub's "Issue:
Labeled" event, filtered on `agent:go`, and runs this skill unattended. Nobody
is watching, so every refusal is a comment on the issue, never a question.
What the cloud can and cannot do, and the reason behind each workaround below,
is in `docs/agents/cloud-environment.md`: read it when a command fails there.

## 1. Gate

Which issue: the one the trigger context names. A run with no trigger context
lists the open issues labelled `agent:go`; exactly one is yours, and with
several, comment on each that the run could not tell which it was for and stop.

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

Each command runs in a fresh shell, so nothing exported carries over: the
scripts keep their own state. `agent-db` sets up the cloud's proxy itself, and
`session` saves the cookie where `shoot.cjs` finds it. The dev server is the
one command that needs the proxy switch on its own line:

```bash
npm run agent-db -- up <issue number>                 # branch, .env.local, migrate, seed
npm run agent-db -- dev                               # next dev on :3200, returns once it answers
npm run -s agent-db -- session Casey                  # prints and saves the cookie
```

`up` prints the fake members and the state each is in: Casey is the
commissioner and organizer, Jordan and Riley have every Week 7 pick in, Morgan
some, Taylor and Sam none, and Drew has not finished `/welcome`. Week 6 is
final; Week 7 is open with its Deadline three days out. For a screen that
shows a game under way (the Live Board, the Game sheet, the field card), run
`up <issue number> --live` instead: Week 7's Deadline has passed and Liberty at
Coastal Carolina is in progress, Q2 10:27, from a real recorded CFBD feed.
Set up any other state the screens need with
`npm run agent-db -- sql "<statement>"`, the one way to change the branch's
data: it runs only against this run's branch, so it is covered by the same
authorization as `up` and `down`. The seeded Week 7 has Coastal Carolina at
home; `update games set home_team = 'LSU' ...` turns it into another school's.

Before writing any code, screenshot every existing screen the ticket will
change, in the state that shows the change, as the member who would see it:

```bash
node .claude/skills/agent-go/shoot.cjs --label before --out /tmp/shots /picks /leaderboard
```

`/tmp/shots` is where `npm run preflight` looks. Add `--width 360` for the
phone width a ticket names, and `--open "<text>"` to click a Live Board row so
its Game sheet is on screen (`--scroll "<heading>"` brings a card into view).
The app has one theme, light: a ticket that asks for dark gets one note in the
PR, "no dark mode", and no screenshot.

Read every before shot. Anything covering the screen is the state to fix
before going on, not the screen. `shoot.cjs` marks the What's new modal seen
(pass `--show-whats-new` when the ticket is about the modal), and the fake
members have dismissed the Welcome Tour.

A path takes its own key as `<key>=<path>` (`field-card=/live?week=7`) when
the URL alone would not say which state it shows; the after shot must use the
same key. A screen the ticket creates has no before. Write down the keys,
member and state: step 6 repeats them exactly. Run `npm run agent-db -- dev stop`,
and keep the database: it lives until step 6.

A ticket whose diff changes no rendered output, or only creates screens, has no
before: write the reason to `/tmp/shots/skipped.txt`, which is what
`npm run preflight` accepts in place of shots.

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

Run `npm run agent-db -- dev` again and follow `verify-running-app` from step 4 with
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

Then **always** run `npm run agent-db -- down`, failed or not: it stops the dev
server and deletes the branch. If it is refused, delete the branch with the
Neon API (`curl -X DELETE https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID/branches/<branchId>`,
the id is in `.agent-db.json`) and say in the issue comment which way it went. In the PR, put the Screenshots section, list what you checked and what
each screen showed under **Checked on screen**, and anything you could not
reach under **Not verified**.

**Done when** every screen the diff touched has been read signed in, its
before and after are in the PR, and the branch is deleted.

## 7. Ship

Commit, run `npm run preflight` (it fails an agent build whose diff touches
`src/app` or `src/components` and has no before and after shots), push the branch, and open a PR that closes the
issue, written with `/mattpocock-skills:pr`, with its `Members see:` line and
the Screenshots section from step 6. Never merge.

If the build cannot finish, push what exists as a draft PR, run `agent-db down`
if it is still up, and comment on the issue with what stopped it and what
decision it needs from Jonah.

**Done when** the issue links an open PR, ready or draft, whose body has a
`## Screenshots` section (or `Screenshots: none, <reason>` when
`/tmp/shots/skipped.txt` says why), and whose last issue comment says which.
