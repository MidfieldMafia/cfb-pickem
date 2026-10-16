// Renders the Artifact's component previews the way its page does (tokens.css, bundle.css, React 18
// from components/lib, bundle.js, then the preview), twice: "old" with the Artifact's own copies,
// "new" with what .design-artifact/out stages over them. Prints one line per render and writes
// <shots>/<Component>.old.png and .new.png. Fails on a render error, a missing export, a type-style
// collision, or display text in Wordmark, TeamName or StandingCard that is not Chivo Black.
//
//   node .design-artifact/render.mjs --artifact <dir> --shots <dir> --puppeteer <dir>
//
// --artifact   the folder the Artifact `read` saved into (it holds project/...)
// --puppeteer  a folder with puppeteer-core installed (`npm i puppeteer-core --prefix <dir>`;
//              the skill reuses one at ~/.cache/slate-browser);
//              it drives the machine's own Chrome, as the verify-running-app skill does.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { afterSave, staleTypeRules, typeStyles } from "./served.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0 || !args[i + 1]) {
    console.error(`missing --${name}`);
    process.exit(1);
  }
  return path.resolve(args[i + 1]);
};
const carried = path.join(arg("artifact"), "project");
const staged = path.join(here, "out/project");
const shots = arg("shots");
const puppeteer = createRequire(path.join(arg("puppeteer"), "package.json"))("puppeteer-core");

const CHROME =
  process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "C:/Program Files/Google/Chrome/Application/chrome.exe";

const pick = (rel, preferStaged) => {
  const s = path.join(staged, rel);
  return preferStaged && fs.existsSync(s) ? s : path.join(carried, rel);
};
const txt = (p) => fs.readFileSync(p, "utf8");

for (const need of ["tokens.css", "components/lib/react.production.min.js", "components/lib/react-dom.production.min.js", "components/bundle.js", "components/bundle.css"]) {
  if (!fs.existsSync(path.join(carried, need))) {
    console.error(`${need} is not in ${carried}: read it off the Artifact first.`);
    process.exit(1);
  }
}

// The page compiles every type style in tokens.json into a `.<name>` class in tokens.css, setting
// family, weight and tracking. Those rules are unlayered, and bundle.css is Tailwind 4, whose
// utilities sit in `@layer utilities`: an unlayered rule wins whatever the order. A style named
// like a class the bundle uses (`text-xs`, `text-2xl`) strips `font-bold` / `font-display` off
// every element that carries both, silently. So a collision fails the run.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const definesClass = (css, name) => new RegExp(`\\.${escapeRe(name)}(?![A-Za-z0-9_\\\\-])`).test(css);
const newStyles = typeStyles(pick("tokens.json", true));
const collisions = newStyles.filter((n) => definesClass(txt(pick("components/bundle.css", true)), n));
for (const n of collisions) console.log(`COLLISION: tokens.json type style "${n}" is also a class in bundle.css; rename the style`);

// tokens.css is regenerated only by a save in the page, so the served copy can lag tokens.json,
// staged or not: a sync that skipped the save left `.text-xs`…`.text-4xl` live for three weeks.
// "old" renders the served copy as it is and names any rule it still has; "new" renders it as the
// save in step 5.4 of the skill leaves it.
const carriedTokens = txt(path.join(carried, "tokens.css"));
const stale = staleTypeRules(carriedTokens, typeStyles(path.join(carried, "tokens.json")));
if (stale.length) console.log(`STALE: the served tokens.css still has ${stale.map((n) => `.${n}`).join(" ")}; step 5.4's save drops them`);
const stagedTokens = afterSave(carriedTokens, newStyles);

// A wrong face renders without an error, so these previews' display text is asserted, not eyeballed:
// every `.font-display` in them must compute to Chivo at 700 or heavier.
const DISPLAY_TELLS = ["Wordmark", "TeamName", "StandingCard"];

const names = new Set();
for (const root of [carried, staged]) {
  const dir = path.join(root, "components");
  if (!fs.existsSync(dir)) continue;
  for (const d of fs.readdirSync(dir)) if (fs.existsSync(path.join(dir, d, "preview.html"))) names.add(d);
}

fs.mkdirSync(shots, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
let failed = 0;
for (const name of [...names].sort()) {
  for (const side of ["old", "new"]) {
    const useNew = side === "new";
    const previewPath = pick(`components/${name}/preview.html`, useNew);
    if (!fs.existsSync(previewPath)) {
      console.log(`${name} ${side}: (no preview)`);
      continue;
    }
    const preview = txt(previewPath);
    const card = preview.split("\n")[0];
    const width = Number(card.match(/width=(\d+)/)?.[1] ?? 720);
    const height = Number(card.match(/height=(\d+)/)?.[1] ?? 300);
    const html = `<!doctype html><html><head><meta charset="utf-8">
<style>${useNew ? stagedTokens : carriedTokens}</style>
<style>${txt(pick("components/bundle.css", useNew))}</style>
<style>body{margin:0;background:var(--background)}</style>
<script>${txt(path.join(carried, "components/lib/react.production.min.js"))}</script>
<script>${txt(path.join(carried, "components/lib/react-dom.production.min.js"))}</script>
<script>${txt(pick("components/bundle.js", useNew))}</script>
</head><body>${preview}</body></html>`;
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    // setContent, not goto, and no networkidle: the fonts come from Google and may never settle.
    await page.setContent(html, { waitUntil: "load", timeout: 20000 });
    await new Promise((r) => setTimeout(r, 500));
    const text = await page.evaluate(() => document.body.innerText.slice(0, 80).replace(/\s+/g, " "));
    if (DISPLAY_TELLS.includes(name)) {
      const wrong = await page.evaluate(() =>
        [...document.querySelectorAll(".font-display")]
          .map((el) => ({ el, cs: getComputedStyle(el) }))
          .filter(({ cs }) => !/^"?Chivo/.test(cs.fontFamily) || Number(cs.fontWeight) < 700)
          .map(({ el, cs }) => `"${el.textContent.trim().slice(0, 20)}" in ${cs.fontFamily.split(",")[0]} ${cs.fontWeight}`),
      );
      if (wrong.length) errors.push(`display text not Chivo Black: ${wrong.join("; ")}`);
    }
    // fullPage: the page grows a card to fit its content, so a viewport-sized shot crops what it shows.
    await page.screenshot({ path: path.join(shots, `${name}.${side}.png`), fullPage: true });
    await page.close();
    const missing = text.startsWith("Missing from bundle");
    if (useNew && (errors.length || missing)) failed++;
    console.log(`${name} ${side}: ${errors.length ? "ERR " + errors[0].slice(0, 120) : "ok"} | ${text}`);
  }
}
await browser.close();
failed += collisions.length;
console.log(failed ? `${failed} new render(s) failed` : "every new render is clean");
// puppeteer can leave the process alive on Windows; exit explicitly.
process.exit(failed ? 1 : 0);
