---
name: verify-running-app
description: Sign in to a running Saturday Slate and check a change on a real screen. Use when a diff touches a page or component, or anything whose result is rendered rather than returned.
---

# Verify against the running app

Nothing in the test suite covers rendering, so a change to a page or component
is unverified until you have read it on a served screen. `curl` is the floor: it
sees the server's first pass. Anything the browser settles (a control that
reacts, a layout that resolves, a target big enough to hit) needs step 5.

Every screen except `/expired` needs a session, and the only way in is a Magic
Link minted from the database by a commissioner. You ask for one.

The app has one theme, light, so there is no dark screen to check. A ticket
that asks for light and dark is checked in light, and says so.

Alex works on Windows and Jonah on macOS. Steps that differ say which is which.

## 1. Claim your port

`next dev` does not fail on a taken port. It warns and moves up:

```
Port 3000 is in use by process 1234, using available port 3001 instead.
```

So when another checkout holds 3000, `localhost:3000` answers with **the wrong
tree**: the other checkout's code, looking fine whether or not your change
works. A green check against the wrong tree is the worst outcome this skill can
produce.

```bash
[ "$(git rev-parse --git-dir)" = "$(git rev-parse --git-common-dir)" ] \
  && echo "main checkout" || echo "WORKTREE"

PORT=3000          # main checkout
PORT=3101          # a worktree: any free port that is yours alone
BASE="http://localhost:$PORT"
```

**Done when** `$PORT` and `$BASE` are set and you know which checkout they serve.

## 2. Get your own server on it

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/api/health"
```

A `200` in the main checkout means reuse it. In a worktree a `200` proves only
that *a* Saturday Slate is listening; unless you started it on that port
yourself, it is someone else's, so pick another port.

Otherwise start one in the background, read the startup output for the port it
actually bound (a "using available port" warning means `$PORT` is now wrong),
then wait:

```bash
npm run dev -- -p "$PORT"

for i in $(seq 1 30); do
  curl -s -o /dev/null -w "%{http_code}" "$BASE/api/health" 2>/dev/null \
    | grep -qE "200|500" && { echo "up after ${i}s"; break; }
  sleep 1
done
```

A worktree that prints `Ready` and then 500s every route with
`PageNotFoundError`, or throws `DATABASE_URL is not set`, is **cold**: see the
Cold gaps in `new-worktree`.

**Design-system edits are stale until rebuilt.** The app imports
`@saturday-slate/design-system` from its `dist/`, which tsup writes only in the
root `postinstall`. `next dev` goes on serving the old component with no error
and no hot reload, or half-changed markup against fresh CSS. After every edit
to the package run `npm run build --workspace @saturday-slate/design-system` (or
leave its `dev` script watching), then confirm the served markup carries the
change before reading any screen:

```bash
curl -s "$BASE/<route>" | grep -c '<a string only your change produces>'
```

**Done when** `/api/health` answers `200` from a server you started on `$PORT`,
serving your current source.

## 3. Get a session

Ask the user for a Magic Link, naming the member state the check needs (a
commissioner, a member who has not picked). They arrive fast, and a member who
is already in that state turns a write into a read. A link looks like
`https://slate.midfield-mafia.com/m/<token>`; the token is what matters, so
send it to your own `$BASE`:

```bash
curl -s -i "$BASE/m/<token>" | head -6
```

A good token answers `307` toward wherever the Week's state lands the member
(`landingRoute`), or `/welcome` on their first sign-in, and sets the cookie:

```
set-cookie: slate_session=<value>; Path=/; HttpOnly; SameSite=lax
```

A redirect to `/expired` means the token is spent or unknown: ask for a fresh
one. The session is a database row, so a cookie minted on one checkout works on
all of them.

The token and the cookie are **live credentials**. They live in shell variables
for the length of the check, and nowhere else: not a file, a commit, a PR body,
an issue, or any request that leaves this machine.

```bash
S="slate_session=<value>"
```

**Done when** `$S` holds a `slate_session` cookie.

## 4. Read every screen the diff touched

Write fetched pages to this session's scratchpad (the path named in your system
prompt) as `$SCRATCH`. On Windows, use it exactly as given, Windows-style:
`node` is a Windows binary there and reads a Git Bash path like `/tmp/x.html` as
`C:\tmp\x.html`, so only a Windows path reaches both the shell and node.

```bash
SCRATCH="<the scratchpad path from your system prompt>"

curl -s -b "$S" "$BASE/picks" \
  -o "$SCRATCH/picks.html" -w "status=%{http_code} bytes=%{size_download}\n"
grep -oE "<h1[^>]*>[^<]*</h1>" "$SCRATCH/picks.html"
```

- **Member** (`src/app/(member)/`): `/picks`, `/picks/review`, `/live`,
  `/leaderboard`, `/chat`, `/you`; and `/welcome`, which sits outside that folder.
- **Commissioner** (the member needs `isCommissioner`): `/console`,
  `/console/slate`, `/console/members`, `/console/picks`,
  `/console/picks/<memberId>`, `/console/results`.

Most take `?week=<n>`; a change that depends on a Week's state needs the week
named.

A `200` means the route rendered; the HTML still has to show your change. A
`307` is the auth guard answering, and says nothing about whether the route
compiles. That check is `npx next build` (Checks, in `CLAUDE.md`).

**Done when** every screen the diff touched answered `200` and its HTML shows
the change.

## 5. Settle what curl cannot see

`curl` runs no JavaScript, so client-only behaviour shows only its first pass:
the drawer, `LocalTime`'s `useHydrated` rendering, the pick flow's chip
transitions, a control that submits its own form on change, a `details`
disclosure, the real size of a tap target. When the diff reaches any of these,
drive a real browser: [browser.md](browser.md).

**Done when** every client-side behaviour the diff touched has a measurement
that passes, not only a screenshot that looks right.

## 6. Screenshots for the PR

A PR whose diff touches `src/app/` or `src/components/` shows each screen it
changed, before and after, or says `Screenshots: none, <reason>` (the PR
template has the section). The repository is public, so the shots come only
from the fake league of a throwaway `agent-db` branch, never from a Magic Link
session: `pr-shots` refuses to run without one. The agent:go routine follows
its own steps 4 and 6 for this; this is the same thing from a local session.

**Before the first edit**, when you expect the diff to touch those folders.
Do it in a worktree, never the main checkout: `agent-db` refuses a
`.env.local` it did not write, and `down` deletes the one it did, so the
worktree's copy of the shared one goes first and comes back at the end.

```bash
rm -f .env.local                    # warm.sh's copy; the main checkout keeps the original
npm run agent-db -- up <issue number>
npm run agent-db -- dev             # next dev on :3200
npm run -s agent-db -- session Casey
node scripts/shoot.cjs --label before --out /tmp/shots /picks /leaderboard
```

`agent-db` needs `NEON_PROJECT_ID` and `NEON_API_KEY` (a key for
`slate-agents`) in your shell. `up` prints the fake members and their states;
pick the member and state that show the change, set up anything else with
`agent-db -- sql`, and write down the keys, member and state, since the after
shots repeat them exactly. The agent-go skill's step 4 has the seeded states,
`shoot.cjs`'s options and the rule for keys.

**If you only find out after editing**, run the same `up`, `dev` and
`session` first, then take the befores from `main` instead: a throwaway
worktree on another port, against the same fake league.

```bash
git worktree add ../before-shots origin/main
cp .env.local ../before-shots/      # agent-db's, pointing at the fake league
(cd ../before-shots && npm ci)
(cd ../before-shots && npx next dev -p 3201)   # run_in_background; wait for /api/health
BASE=http://localhost:3201 node scripts/shoot.cjs --label before --out /tmp/shots /picks
lsof -ti tcp:3201 | xargs kill      # stop that server
git worktree remove --force ../before-shots
```

`shoot.cjs` dismisses the What's new entry your branch's
`src/components/whats-new.tsx` names; if your diff changed that entry, check
the modal covers nothing on `main`'s shots.

**After the change**, shoot the same keys on your branch, read every shot (an
error page or a half-loaded screen is a finding, not an illustration), print
the section, then open the PR:

```bash
node scripts/shoot.cjs --label after --out /tmp/shots /picks /leaderboard
npm run pr-shots -- <issue number> /tmp/shots --member Casey --state "Week 7 open"
npm run agent-db -- down
cp "$(git rev-parse --git-common-dir)/../.env.local" .   # the shared one back
```

`up` also leaves an `.agent-run` file, which turns on preflight's shots check:
the push gate wants `/tmp/shots` to hold the befores and afters, or a reason
in `/tmp/shots/skipped.txt`.

`pr-shots` prints the Screenshots section with `![key](./before--key.png)`
links and leaves the PNGs next to `/tmp/shots/body.md` (`--body <file>` puts
them next to another body file). Put the section in the body, and run
`gh pr create --body-file body.md --attach ./before--picks.png …` from that
directory, as it prints: `--attach` uploads each image and rewrites its link.
Nothing is committed. The cloud cannot `--attach`, so agent-go runs
`pr-shots --branch` instead, which commits the PNGs to `agent-screenshots`.

**Done when** the PR body carries the Screenshots section, or the line saying
why it has none.
