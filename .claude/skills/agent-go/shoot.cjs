// Screenshots of signed-in screens at phone width, for the before/after pair
// in an agent:go PR. One file per path, named `<label>--<key>.png`, so
// `npm run agent-shots` can pair a before with its after by key.
//
//   node .claude/skills/agent-go/shoot.cjs --label before --out /tmp/shots /picks /leaderboard
//   node .claude/skills/agent-go/shoot.cjs --label after --out /tmp/shots field-card=/live?game=3
//
// A path may carry its own key as `<key>=<path>` when the URL alone would not
// name the state well. The What's new modal is marked seen so it covers
// nothing; pass --show-whats-new for a ticket about the modal. Run it from the
// worktree root. Reads BASE (default http://localhost:3200) and S, the
// `slate_session=<id>` line `npm run agent-db -- session <name>` prints.
// puppeteer-core loads from ~/.cache/slate-browser (verify-running-app/browser.md).
const fs = require("fs");
const os = require("os");
const path = require("path");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return args.splice(i, 2)[1];
};
const label = flag("label");
const out = flag("out", "/tmp/shots");
const showWhatsNew = args.includes("--show-whats-new");
if (showWhatsNew) args.splice(args.indexOf("--show-whats-new"), 1);
const targets = args;
if (!label || targets.length === 0) {
  console.error("Usage: shoot.cjs --label before|after [--out dir] <path | key=path>...");
  process.exit(2);
}

const BASE = process.env.BASE || "http://localhost:3200";
// S, or the cookie `agent-db session` last minted, kept in its state file.
const saved = () => {
  try {
    return JSON.parse(fs.readFileSync(".agent-db.json", "utf8")).session || "";
  } catch {
    return "";
  }
};
const session = (process.env.S || saved()).replace(/^slate_session=/, "").trim();
if (!session) {
  console.error("Set S to the slate_session=<id> line from `npm run agent-db -- session <name>`.");
  process.exit(2);
}

const CHROME =
  process.env.CHROME ||
  ["/opt/pw-browsers/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((p) =>
    fs.existsSync(p),
  );
// Installed once per machine outside the repo (verify-running-app/browser.md), here if missing.
const PPT = path.join(os.homedir(), ".cache/slate-browser");
if (!fs.existsSync(path.join(PPT, ".installed"))) {
  require("child_process").execFileSync("npm", ["i", "puppeteer-core", "--prefix", PPT, "--no-audit", "--no-fund"], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  fs.writeFileSync(path.join(PPT, ".installed"), "");
}
const puppeteer = require(path.join(PPT, "node_modules/puppeteer-core"));

/** "/picks/review?week=6" → "picks-review-week-6"; "/" → "home". */
const keyOf = (target) => {
  const eq = target.indexOf("=");
  if (eq > 0 && !target.slice(0, eq).includes("/")) return [target.slice(0, eq), target.slice(eq + 1)];
  const key = target.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "home";
  return [key, target];
};

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.setCookie({ name: "slate_session", value: session, domain: new URL(BASE).hostname, path: "/" });
  // The What's new modal opens over every member screen in a browser that has
  // not seen this week's entry, which a fresh Chromium never has. Mark it seen
  // (src/lib/whats-new.ts) unless the ticket is about the modal itself.
  const entry = fs.readFileSync("src/components/whats-new.tsx", "utf8").match(/\bid: "([^"]+)"/);
  if (!showWhatsNew && entry) {
    await page.evaluateOnNewDocument((id) => {
      try {
        localStorage.setItem("whats-new-seen", id);
      } catch {}
    }, entry[1]);
  }
  let failed = 0;
  for (const target of targets) {
    const [key, urlPath] = keyOf(target);
    try {
      const response = await page.goto(new URL(urlPath, BASE).href, { waitUntil: "domcontentloaded", timeout: 60000 });
      // Client components settle after the first paint, and a streamed redirect
      // (a locked Week's /picks → /picks/review) lands only after next dev compiles
      // its target. Wait for the page's own requests to go quiet, but not for the
      // network to: Chromium's refused calls to Google keep that busy forever.
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await page.waitForNetworkIdle({ idleTime: 1500, timeout: 30000 }).catch(() => {});
      // next dev's own badge sits over the bottom nav; it is not part of the app.
      await page.evaluate(() => document.querySelectorAll("nextjs-portal").forEach((el) => el.remove()));
      // A full-page screenshot draws fixed elements where the first screen ended, so
      // grow the viewport to the page instead: the bottom nav stays at the bottom.
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewport({ width: 390, height: Math.max(844, height), deviceScaleFactor: 2 });
      const file = path.join(out, `${label}--${key}.png`);
      await page.screenshot({ path: file });
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
      const landed = new URL(page.url()).pathname;
      const moved = landed === new URL(urlPath, BASE).pathname ? "" : ` (landed on ${landed})`;
      console.log(`${response ? response.status() : "???"} ${urlPath}${moved} -> ${file}`);
    } catch (error) {
      failed++;
      console.error(`FAILED ${urlPath}: ${error.message}`);
    }
  }
  process.exit(failed ? 1 : 0);
})();
