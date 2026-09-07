---
name: verify-running-app
description: Sign in to a running Saturday Slate and check a change on a real screen. Use when a diff touches a page or component, or anything whose result is rendered rather than returned.
---

# Verify against the running app

The test suite covers the server seams — picks, slate, results, scoring — and
nothing covers rendering. A change to a page or a component is unverified until
it has been fetched from a running server. Fetching is the floor, not the
ceiling: anything the browser decides — a control that reacts, a layout that
resolves, a target big enough to hit — needs step 8.

Every screen except `/expired` needs a session, and the app has no password
login. The only way in is a Magic Link, which is minted from the database by a
commissioner. **You cannot issue one yourself. Ask.**

## 1. Work out which checkout you are in

```bash
git rev-parse --show-toplevel
[ "$(git rev-parse --git-dir)" = "$(git rev-parse --git-common-dir)" ] \
  && echo "main checkout" || echo "WORKTREE"
```

This matters more than it looks. `next dev` does not fail when its port is
taken — it warns and moves:

```
Port 3000 is in use by process 1234, using available port 3001 instead.
```

So if another checkout already holds 3000, your server lands on 3001, a request
to `localhost:3000` is answered by **the other checkout's code**, and the screen
comes back looking fine whether or not your change works. A green result from
the wrong tree is the worst outcome this skill can produce.

Pick your port explicitly and keep it in a variable:

```bash
PORT=3000          # main checkout
PORT=3101          # a worktree — any free port that is yours alone
BASE="http://localhost:$PORT"
```

## 2. Get a server on that port

Check whether yours is already up:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/api/health"
```

`200` in the **main checkout** means reuse it. `200` in a **worktree** proves
only that *a* Saturday Slate is listening, not that it is yours — if you did not
start it on that port yourself, treat it as somebody else's and pick another
port.

Otherwise start one, in the background, on your port:

```bash
npm run dev -- -p "$PORT"
```

Read the startup output and confirm the port it actually bound. If it warns that
your port was in use, it has moved, and `$PORT` is now wrong — update it or pick
another. Then wait:

```bash
for i in $(seq 1 30); do
  curl -s -o /dev/null -w "%{http_code}" "$BASE/api/health" 2>/dev/null \
    | grep -qE "200|500" && { echo "up after ${i}s"; break; }
  sleep 1
done
```

Never reach for `npm run build` here. It runs `drizzle-kit migrate` against the
shared database first. See the Checks section of `CLAUDE.md`.

### A worktree has no `node_modules`

`next dev` will not serve a worktree that has not been installed into. It starts,
prints `Ready`, and then answers every route with a 500:

```
⨯ Error [PageNotFoundError]: Cannot find module for page: route not found /api/health/route
```

Turbopack takes the nearest lockfile as the workspace root, finds the worktree's
own `package-lock.json`, then finds no `next` beneath it, and compiles nothing.
The fix is a real install in the worktree:

```bash
npm ci --no-audit --no-fund
```

Do not substitute a symlink or a junction to the main checkout's `node_modules`.
Turbopack rejects it outright and panics:

```
Symlink [project]/node_modules is invalid, it points out of the filesystem root
```

### A worktree has no `.env.local`

`.env` files are gitignored, so a fresh worktree does not get one and `db()`
throws `DATABASE_URL is not set` on the first request. Copy it from the main
checkout:

```bash
cp "$(git rev-parse --git-common-dir)/../.env.local" .env.local
```

Every checkout then points at the same shared Neon database. Fine for reading a
screen. It also means a commissioner action taken in a worktree is a real write
that everyone else sees — so drive the console deliberately, not idly.

## 3. Ask for a Magic Link

Ask the user for one; Jonah issues them. It looks like:

```
http://localhost:3000/m/<token>
```

The token is what matters, not the port — swap in your own `$BASE`.

## 4. Trade it for a session cookie

```bash
curl -s -i "$BASE/m/<token>" | head -6
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

The session is a database row, so a cookie minted against one checkout works on
any of them.

## 5. Fetch the screens the diff touched

`$SCRATCH` below is this session's scratchpad directory, as a Windows-style
absolute path — the one named in your system prompt. Step 6 says why the path
shape matters.

```bash
SCRATCH="C:/Users/<you>/AppData/Local/Temp/claude/<project>/<session>/scratchpad"

curl -s -b "$S" "$BASE/week" \
  -o "$SCRATCH/week.html" -w "status=%{http_code} bytes=%{size_download}\n"
```

Member screens: `/week`, `/picks`, `/picks/review`, `/welcome`.
Commissioner screens, which need a member whose `isCommissioner` is set:
`/console`, `/console/slate`, `/console/members`, `/console/picks`,
`/console/picks/<memberId>`, `/console/results`. Most take `?week=<n>`, so a
change that depends on a Week's state needs the week named.

A `200` means the route rendered for this request. Then actually read the HTML
for the thing you changed — a page that renders is not a page that renders
correctly. A `307` means the auth guard answered instead, and proves nothing
either way: see "What this does not cover".

```bash
grep -oE "<h1[^>]*>[^<]*</h1>" "$SCRATCH/week.html"
```

## 6. Windows path trap

`node` here is a Windows binary and Git Bash paths do not reach it. A file
written to `/tmp/week.html` from the shell is read back by
`node -e "fs.readFileSync('/tmp/week.html')"` as `C:\tmp\week.html`, which fails
with `ENOENT`.

Use the session scratchpad with a Windows-style absolute path, and hand the same
path to both the shell and node.

## 7. The token and the cookie are real credentials

Both are live session material. Keep them in the shell for the length of the
check. Do not write them into a file, a commit, a PR body, an issue, or any
request that leaves this machine. Local does not mean harmless.

## 8. What curl cannot see, and how to drive a browser

`curl` returns server-rendered HTML with no JavaScript executed, so anything
client-only shows its first server pass and not its settled state: the drawer,
`useHydrated` time rendering in `LocalTime`, the pick flow's chip transitions,
a control that submits its own form on change, a `details` disclosure, and the
real size of a tap target.

There is no `chromium-cli` here — it is not an npm package and nothing installs
it. What is missing is a driver, not a browser: Chrome and Edge are both on the
machine. Install the driver into the scratchpad, never the repo, so
`package.json` stays clean:

```bash
npm i puppeteer-core --prefix "$SCRATCH" --no-audit --no-fund
```

```js
const puppeteer = require("puppeteer-core");
const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
// The cookie from step 4. `domain` is the host with no port.
await page.setCookie({ name: "slate_session", value: SESSION, domain: "localhost", path: "/" });
```

**Measure; do not eyeball.** A screenshot shows you the things you thought to
look at. Assert on numbers — `getBoundingClientRect()`, `scrollWidth >
clientWidth`, `document.elementFromPoint(x, y) === el` — and read the
screenshot afterwards for what numbers miss. PR #67's four rendering defects
were all found by a measurement that disagreed with the screenshot: a rail
8,000px tall, a header wider than the viewport, a mis-sorted-looking kickoff
column, and a class of 40px tap targets.

Two traps in the measuring:

- A **closed `details`** keeps a layout rect in Chrome, so height is not a test
  of hidden-ness. Its subtree is not painted and not hit-tested: check that
  `innerText` is empty, or that `elementFromPoint` does not return the element.
- A **checkbox's hit area** is the `label` wrapping it, not the 20px box. Walk
  up with `closest("label")` before measuring.

Driving the console is a **real write to the shared Neon database**. Prefer a
week nobody is using, prefer an action that reverses itself, and confirm the
reversal — PR #67 checked the slate builder's checkbox by putting one game on
a past, empty, unpublished week and taking it back off, asserting the count
returned to `0 games`.

## What this does not cover

Rendering is not compiling. Every console and member screen answers **307**
from its layout's auth guard before rendering, so a redirect tells you nothing
about whether the route builds. When a diff touches a `"use server"` file, a
route handler, or the client/server boundary, `npx next build` is the check —
see the Checks section of `CLAUDE.md`.
