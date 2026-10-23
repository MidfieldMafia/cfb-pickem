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

The routine's session is the **orchestrator**: it runs steps 1, 2 and 2b
itself. Step 2b asks Jev how hard the ticket is and hands steps 3–7 to one
subagent on the model and effort that answer picks, since a session cannot
change its own (#463).

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

Remove `agent:go` and assign the issue to `jonahmabry`. Removing the label
first is what makes check 1 stop a duplicate run. The "build started" comment
waits for step 2b, which adds the tier to it.

Then record the claim time, which step 7 turns into minutes:
`date -u +%s > /tmp/agent-go-claim-<issue number>`. Each command runs in a
fresh shell, so the file is the only place it survives.

## 2b. Route and hand off

Only a run that passed all four gate checks gets here, so a ticket that stops
at the gate never reaches Jev.

```bash
npm run -s agent-route -- <issue number>
```

builds Jev's state from the issue (its title, body and labels, whether it has
an Agent Brief, the comments that are a brief or spec, the parent map's title,
and each path the brief names with its line count; no file contents), asks the
question below, applies the table, and prints the route as one JSON line, saved
to `/tmp/agent-go-route-<issue number>.json`. It never stops the run over Jev:
with no `TYPESAFE_API_KEY`, a network error, a non-200 or an answer it cannot
read, it prints the routine's default (level 1, Sonnet medium) with
`"reason":"jev-error"` and the `error`. If the command itself fails, build on
that default and say so.

Then comment on the issue that the build has started, and on what:
`Build started on opus / medium: Jev level 2, confidence 0.55, below 0.7 so level 4.`
On a Jev error: `Build started on sonnet / medium, the routine's default: Jev failed (<error>).`

### Jev's question

`npm run agent-route` reads the question, the five levels and the table from
this section, and the tests in `src/lib/agent-go/route.test.ts` hold it to
five of each. Retune the levels and the 0.7 floor here after about ten
`Built on:` lines (#463 decision 10); `route.ts` holds the floor.

Question: How much judgment and risk does building this ticket carry, for a coding agent working alone from the ticket to an open PR with nobody to ask?

1. Mechanical. A full Agent Brief names the files and the exact change, with
   nothing left to decide, and the diff stays in a few files of presentation or
   copy, like #334 (the Your pick card: a logo disc, a Lock badge and the
   viewer's Tiebreaker Guess, built in PR #459 with no failed step).
2. Routine. A full brief, but the build makes small calls of its own: a new
   component or helper, a test seam to choose, or several screens touched in the
   same way.
3. Involved. A brief that leaves real decisions open, or a change across server
   and client: a new route handler or server action, a new table read, or shared
   logic that several screens rely on.
4. Risky. It touches grading or scoring, what members can see before the
   Deadline or Reveal, a database migration, or money and messaging limits; or
   the brief is thin and the build has to work out what is meant.
5. Open. No Agent Brief, or open design questions the build must settle itself,
   or several of the level 4 risks at once.

| Level | `model` | `effort` |
|---|---|---|
| 1 | `sonnet` | `medium` |
| 2 | `sonnet` | `high` |
| 3 | `opus` | `low` |
| 4 | `opus` | `medium` |
| 5 | `opus` | `high` |

Jev's most probable level picks the row; confidence below 0.7 builds at level 4
whatever it leaned to, because an under-powered build of a hard ticket costs a
bad PR and an over-powered one only tokens.

### Hand off

Make **one** Agent call with the route's `model` and `effort`,
`run_in_background: false`, no `subagent_type`, and the description
`build #<issue number>`. A background call ends this session's turn before the
build is done. Pick the branch name now, `<slug>-<issue number>`, so a second
leg uses the same one. The subagent starts cold, so the prompt carries
everything:

```text
You are building issue #<issue number> in MidfieldMafia/cfb-pickem, unattended,
as the agent:go routine's build subagent, on <model> / <effort>. The gate and
claim are done: do not comment on the issue, relabel or reassign it. Follow
.claude/skills/agent-go/SKILL.md from step 3 to step 7, exactly, on branch
<branch>. Your effort for the Built on: line is <effort>.

Your build instructions, from the routine's /mattpocock-skills:implement,
which cannot be invoked from here:
<implement's instructions, verbatim as they appear in your context>

You have no Agent tool, so where code-review says to run its two axes as
parallel sub-agents, run Standards and then Spec yourself, one after the other.

<the routine prompt's "Authorized for this run" sentence, verbatim>

Nobody is watching: never ask a question. Never merge and never push to main.
If the build cannot finish, commit and push what exists, run agent-db down if
it is up, and stop: open no draft PR, since the orchestrator decides what
happens next. End with exactly two lines: the model id you run on, as you know
it, then the PR URL or FAILED: <why>.
```

A second leg (below) adds, after the first paragraph: `An earlier leg on
<model> / <effort> stopped: <its FAILED line>. Its worktree is <path from git
worktree list>, on <branch>: work there instead of making a new one, run
warm.sh again, and continue from what it left. Keep /tmp/shots/before--*.png,
which it took before any code.`

The call returns a line ending `<usage>subagent_tokens: N tool_uses: M
duration_ms: D</usage>`, and the subagent's final report arrives as a separate
message after it. Note each leg's model id from that report, and N and M from
the call: they are the build's tokens and tool calls. Nothing reports this
session's own.

### After the subagent returns

- **A PR URL**: go to the `Built on:` line below.
- **`FAILED`, or no PR URL**: escalate once. `npm run -s agent-route -- <issue
  number> --escalate` prints the next level's route and saves it, or
  `no escalation: level 5`. Dispatch a second leg on it, with the extra
  paragraph above. A run that has had two legs, or is at level 5, gets no
  more: if the branch was pushed, open a draft PR from it that closes the
  issue (with the `Members see:` and `Built on:` lines), then comment on the
  issue with what stopped it and what decision it needs from Jonah.

Then rewrite the PR body's `Built on:` line, in place, to the full format in
step 7, keeping the minutes the subagent wrote (a draft you open, you time
yourself): `gh pr view <n> --json body`, replace only the line that starts
`Built on:`, and `gh pr edit <n> --body-file <file>`. Change nothing else in
the body, `Members see:` least of all. Comment the PR's URL on the issue, and
end with the issue number and the PR URL, or why there is none.

**Done when** the subagent has returned, at most twice, the PR's `Built on:`
line is the full format, and the issue's last comment says which PR or why none.

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
authorization as `up` and `down`. It takes one statement per call. The seeded
Week 7 has Coastal Carolina at home. Turning a game into another school's
changes `games.home_team_id` and `home_team` together (`away_*` likewise), and
the member's `picks.team_id` with them. A void is `games.void = true` with a
`void_note`. A Lock is one `locks` row per member and week, so move it with
`update locks set game_id = ...`. The Week's Tiebreaker Game is
`weeks.tiebreaker_game_id`, and guesses are in `tiebreaker_guesses`. Team ids are
CollegeFootballData's (Iowa 2294, Michigan State 127, Duke 150), and the
logo follows the id.

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

The routine's prompt starts with `/mattpocock-skills:implement`, and step 2b's
hand-off quotes its instructions: that skill cannot be invoked by the model,
only typed, which is why the prompt carries it. Follow them inside the
worktree, after steps 1–4, including the `tdd` and `code-review` passes (call
the `code-review` skill on the diff before step 6; **done when** every finding
is fixed or listed in the PR). Read
the ticket, its parent map, and any spec, design or research it links first.
Where implement says to ask, there is nobody to answer: make the call the
ticket and docs support and record it under **Judgment calls** in the PR, or,
when nothing supports either way, stop as step 7 says for a build that
cannot finish.

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

Directly under `Members see:` the body carries one evidence line, in this
format and nowhere else in the skill:

`Built on: <legs> (<Jev>) · build <tokens> tokens, <tool calls> tool calls, orchestrator not counted · <minutes> min claim→PR`

for example `Built on: claude-opus-5-5 / medium (Jev level 4, confidence 0.82, 1.2k tokens) · build 1.9M tokens, 41 tool calls, orchestrator not counted · 26 min claim→PR`.

- **Legs**: `<model id> / <effort>` for each build leg, joined by ` → `, with
  ` (escalated)` after a second: `claude-sonnet-5-5 / medium → claude-opus-5-5 / low (escalated)`.
  The model id is the one the build session reports for itself; the effort is
  the one its hand-off named. A run that cannot tell its effort writes
  `effort unknown`, never a guess.
- **Jev**: `Jev level <n>, confidence <c>, <input + output> tokens`, adding
  `, below 0.7 so level 4` when the floor moved it; on an error,
  `Jev error: <error>, routine default`. These come from the saved route.
- **Tokens and tool calls**: each leg's `subagent_tokens` and `tool_uses`,
  summed, as `640k` or `1.9M`. The orchestrator's own are not visible to it,
  which the line says.
- **Minutes**: `($(date -u +%s) - $(cat /tmp/agent-go-claim-<issue number>)) / 60`,
  rounded, taken just before the PR is opened: never estimated.

The build subagent opening the PR writes the parts it knows, its own leg and
the minutes: `Built on: claude-opus-5-5 / medium · 26 min claim→PR`. The
orchestrator rewrites that line in place to the full format (step 2b). The line
sits on its own line, so `Members see:` stays exactly as `weekly-changelog`
reads it.

If the build cannot finish, commit and push what exists, run `agent-db down`
if it is still up, and end with `FAILED: <why>`. Step 2b decides between a
second leg and a draft PR, and comments on the issue.

**Done when** the branch's PR is open, its body has a `## Screenshots` section
(or `Screenshots: none, <reason>` when `/tmp/shots/skipped.txt` says why), and
the subagent has ended with its URL; or it has ended with `FAILED`.
