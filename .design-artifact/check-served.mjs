// Two checks around the publish in step 5 of the sync skill.
//
//   node .design-artifact/check-served.mjs --changed
//       lists the staged project/… files that differ from the step-2 copies in
//       .design-artifact/artifact: the files one publish sends
//   node .design-artifact/check-served.mjs --artifact <dir>
//       run on a fresh `read` taken after the page save (step 5.4), into <dir>; fails while
//       tokens.css still has a type-style rule tokens.json does not define, or while the Notes of
//       the api/ card of a component README this sync changed are not that README's opening
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { changed, staleTypeRules, typeStyles } from "./served.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "out");
const sent = changed(out, path.join(here, "artifact"));

if (process.argv.includes("--changed")) {
  for (const rel of sent) console.log(rel);
  process.exit(0);
}

const i = process.argv.indexOf("--artifact");
if (i < 0 || !process.argv[i + 1]) {
  console.error("pass --changed, or --artifact <dir>");
  process.exit(1);
}
const served = path.join(path.resolve(process.argv[i + 1]), "project");
const problems = [];

const stale = staleTypeRules(fs.readFileSync(path.join(served, "tokens.css"), "utf8"), typeStyles(path.join(served, "tokens.json")));
if (stale.length) problems.push(`tokens.css still has ${stale.map((n) => `.${n}`).join(" ")}: the page has not been saved since tokens.json changed`);

// A card's Notes are the README's body (its `# Name` heading dropped) run together on one line and
// cut at 900 characters: a current card's Notes are the whole body, or its first 900 characters.
// A bare prefix is not enough: a card from before a sentence was appended is one.
const NOTES_CAP = 900;
const squash = (s) => s.replace(/\s+/g, " ").trim();
for (const rel of sent) {
  const name = rel.match(/^project\/components\/([^/]+)\/README\.md$/)?.[1];
  if (!name) continue;
  const body = squash(fs.readFileSync(path.join(out, rel), "utf8").replace(/^# .*\n/, ""));
  const card = path.join(served, "api/components", `${name}.md`);
  if (!fs.existsSync(card)) {
    problems.push(`api/components/${name}.md was not read`);
    continue;
  }
  const notes = squash(fs.readFileSync(card, "utf8").match(/## Notes\n([\s\S]*?)\n## /)?.[1] ?? "");
  if (notes !== body && !(notes.length >= NOTES_CAP && body.startsWith(notes))) problems.push(`api/components/${name}.md Notes do not match its README: "${notes.slice(0, 60)}"`);
}

for (const p of problems) console.log(p);
console.log(problems.length ? `${problems.length} generated file(s) behind the sync` : "the page's generated files are current");
process.exit(problems.length ? 1 : 0);
