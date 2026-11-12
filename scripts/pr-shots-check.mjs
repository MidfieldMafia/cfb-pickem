// @ts-check
/**
 * Fails a PR whose diff touches a screen and whose body neither shows it nor
 * says why not. Run by `.github/workflows/pr-screenshots.yml`; the rule is in
 * `src/lib/pr-shots-check.mjs`.
 *
 *   gh pr diff <n> --name-only | PR_BODY="$(gh pr view <n> --json body -q .body)" node scripts/pr-shots-check.mjs
 *
 * Reads the changed paths from stdin, one per line, and the body from PR_BODY.
 * Exits 1 when the check fails.
 */
import { readFileSync } from "node:fs";
import { screenshotsCheck } from "../src/lib/pr-shots-check.mjs";

const files = readFileSync(0, "utf8").split("\n").map((line) => line.trim()).filter(Boolean);
const { ok, message } = screenshotsCheck(files, process.env.PR_BODY ?? "");
console.log(message);
if (!ok) {
  // An annotation on the run's summary page, with the same text.
  console.log(`::error title=Screenshots::${message.replaceAll("%", "%25").replaceAll("\n", "%0A")}`);
  process.exit(1);
}
