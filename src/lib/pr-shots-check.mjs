// @ts-check
/**
 * The PR body check for screenshots (`.github/workflows/pr-screenshots.yml`,
 * through `scripts/pr-shots-check.mjs`). Plain JavaScript so the workflow runs
 * it on the runner's own Node, with no install.
 */

/** A path whose change needs screenshots: the one copy of this rule. */
export const VISUAL_PATH = /^src\/(app|components)\//;

/** `Screenshots: none, <reason>` or `Screenshots: before not taken, <reason>`, alone on a line. */
const REASON_LINE = /^Screenshots: (none|before not taken),\s*\S/;

/**
 * Whether the body shows the screens or says why not. HTML comments do not
 * count, and a `## Screenshots` heading needs something under it before the
 * next heading of its level, so the PR template's empty section is no answer.
 * @param {string} body
 */
function answers(body) {
  const lines = body.replace(/<!--[\s\S]*?(-->|$)/g, "").split(/\r?\n/).map((line) => line.trim());
  if (lines.some((line) => REASON_LINE.test(line))) return true;
  const heading = lines.indexOf("## Screenshots");
  if (heading === -1) return false;
  const rest = lines.slice(heading + 1);
  const end = rest.findIndex((line) => /^#{1,2} /.test(line));
  return rest.slice(0, end === -1 ? undefined : end).some((line) => line !== "");
}

/**
 * Whether a PR that changes `files` has a body that answers for them.
 * @param {string[]} files
 * @param {string} body
 * @returns {{ ok: boolean, message: string }}
 */
export function screenshotsCheck(files, body) {
  const matched = files.filter((file) => VISUAL_PATH.test(file));
  if (matched.length === 0) {
    return { ok: true, message: "No file under src/app/ or src/components/ changed, so no screenshots are needed." };
  }
  if (answers(body)) return { ok: true, message: `The body answers for ${matched.length} changed file(s) under src/app/ or src/components/.` };
  return {
    ok: false,
    message: [
      `This PR changes ${matched.length} file(s) under src/app/ or src/components/:`,
      ...matched.map((file) => `  ${file}`),
      "",
      "Its body needs a `## Screenshots` section (npm run pr-shots prints one), or one line saying why not:",
      "  Screenshots: none, <reason>",
      "  Screenshots: before not taken, <reason>",
    ].join("\n"),
  };
}
