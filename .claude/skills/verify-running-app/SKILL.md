---
name: verify-running-app
description: Sign in to a running Saturday Slate and check a change on a real screen. Use when a diff touches a page or component, or anything whose result is rendered rather than returned.
---

# Verify against the running app

The test suite covers the server seams — picks, slate, results, scoring — and
nothing covers rendering. A change to a page or a component is unverified until
it has been fetched from a running server.

Every screen except `/expired` needs a session, and the app has no password
login. The only way in is a Magic Link, which is minted from the database by a
commissioner. **You cannot issue one yourself. Ask.**

## 1. Is a server already up?

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/health
```

`200` means one is running — use it, do not start a second on another port.
A connection failure means you need one:

```bash
npm run dev    # run in background
```

Then wait for it:

```bash
for i in $(seq 1 30); do
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null \
    | grep -qE "200|500" && { echo "up after ${i}s"; break; }
  sleep 1
done
```

Never reach for `npm run build` here. It runs `drizzle-kit migrate` against the
shared database first. See the Checks section of `CLAUDE.md`.

## 2. Ask for a Magic Link

Ask the user for one; Jonah issues them. It looks like:

```
http://localhost:3000/m/<token>
```

## 3. Trade it for a session cookie

```bash
curl -s -i "http://localhost:3000/m/<token>" | head -6
```

A good token answers `307` toward `/week` — or `/welcome` on a member's first
ever sign-in — and sets the cookie:

```
set-cookie: slate_session=<value>; Path=/; HttpOnly; SameSite=lax
```

A redirect to `/expired` means the token is spent or unknown. Ask for a fresh
one rather than retrying it.

Hold the cookie in a shell variable, not a file:

```bash
S="slate_session=<value>"
```

## 4. Fetch the screens the diff touched

```bash
curl -s -b "$S" http://localhost:3000/week \
  -o "$SCRATCH/week.html" -w "status=%{http_code} bytes=%{size_download}\n"
```

Member screens: `/week`, `/picks`, `/picks/review`, `/welcome`.
Commissioner screens, which need a member whose `isCommissioner` is set:
`/console`, `/console/slate`, `/console/results`, `/console/members`.

A `200` proves the route compiled and rendered. Then actually read the HTML for
the thing you changed — a page that renders is not a page that renders
correctly.

```bash
grep -oE "<h1[^>]*>[^<]*</h1>" "$SCRATCH/week.html"
```

## 5. Windows path trap

`node` here is a Windows binary and Git Bash paths do not reach it. A file
written to `/tmp/week.html` from the shell is read back by
`node -e "fs.readFileSync('/tmp/week.html')"` as `C:\tmp\week.html`, which fails
with `ENOENT`.

Use the session scratchpad with a Windows-style absolute path, and hand the same
path to both the shell and node.

## 6. The token and the cookie are real credentials

Both are live session material. Keep them in the shell for the length of the
check. Do not write them into a file, a commit, a PR body, an issue, or any
request that leaves this machine. Local does not mean harmless.

## What this does not cover

`curl` returns server-rendered HTML with no JavaScript executed, so anything
client-only shows its first server pass and not its settled state: the drawer,
`useHydrated` time rendering in `LocalTime`, and the pick flow's chip
transitions. For those, drive a real browser — check whether `chromium-cli` is
available before assuming one is.
