# Driving a browser

`puppeteer-core`, pointed at the Chrome already on the machine. There is no
`chromium-cli`: it is not an npm package and nothing installs it.

## Set up

Install the driver into the scratchpad, so `package.json` stays clean:

```bash
npm i puppeteer-core --prefix "$SCRATCH" --no-audit --no-fund
```

It ships no browser. Confirm Chrome is where the script will look:

```bash
ls "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"   # macOS
ls "/c/Program Files/Google/Chrome/Application/chrome.exe"          # Windows
```

Edge is Chromium too and drives the same if Chrome is absent; find its path the
same way.

```js
const puppeteer = require("puppeteer-core");

const CHROME =
  process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
// The cookie from step 3. `domain` is the host with no port.
await page.setCookie({ name: "slate_session", value: SESSION, domain: "localhost", path: "/" });
await page.goto(`${BASE}/week`, { waitUntil: "domcontentloaded" });
```

**End the script cleanly.** It hangs against `next dev` otherwise, and each hung
run leaves a Chrome behind that slows the machine:

- Wait for `domcontentloaded`. `networkidle0` never fires, because the HMR
  websocket stays open.
- Write results to a file, then `process.exit(0)`. `browser.close()` alone
  leaves the process running.

A run that hangs looks like a broken page, which invites a retry that orphans
another Chrome. Stop the hung task first. If `curl` to `$BASE` now returns
`000` while the port is still LISTENING, the dev server is wedged: kill it and
restart it, and tell the user if they are watching that URL.

## Measure

A screenshot shows what you thought to look at. Assert on numbers:
`getBoundingClientRect()`, `scrollWidth > clientWidth`,
`document.elementFromPoint(x, y) === el`. Then read the screenshot for what the
numbers miss. PR #67's four rendering defects were each caught by a measurement
that disagreed with its screenshot: a rail 8,000px tall, a header wider than the
viewport, a kickoff column that looked mis-sorted, and a class of 40px tap
targets.

Two traps:

- A **closed `details`** keeps a layout rect in Chrome, so height does not prove
  it hidden. Its subtree is neither painted nor hit-tested: check that
  `innerText` is empty, or that `elementFromPoint` does not return the element.
- A **checkbox's hit area** is the `label` around it, not the 20px box. Walk up
  with `closest("label")` before measuring.

## Console actions are real writes

Every checkout shares one Neon database, so driving the console writes for
everyone. Pick a week nobody is using and an action that reverses itself, then
confirm the reversal. PR #67 checked the slate builder's checkbox by adding one
game to a past, empty, unpublished week, removing it again, and asserting the
count went back to `0 games`.
