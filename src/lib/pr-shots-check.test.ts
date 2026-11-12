import { describe, expect, test } from "vitest";
import { screenshotsCheck } from "./pr-shots-check.mjs";

const visual = ["src/components/game-card.tsx", "src/lib/spread.ts"];

describe("screenshotsCheck", () => {
  test("fails a PR touching src/components/ whose body has neither form, naming the files and both escapes", () => {
    const result = screenshotsCheck(visual, "Fixes the card.\n\nMembers see: yes");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("src/components/game-card.tsx");
    expect(result.message).not.toContain("src/lib/spread.ts");
    expect(result.message).toContain("Screenshots: none,");
    expect(result.message).toContain("Screenshots: before not taken,");
  });

  test.each([
    ["a Screenshots section", "Fixes the card.\n\n## Screenshots\n\n| Screen | Before | After |\n|---|---|---|\n| `picks` | a | b |\n\n## Tests\n"],
    ["the none line", "Fixes the card.\n\nScreenshots: none, a refactor that renders the same\n"],
    ["the before-not-taken line", "Fixes the card.\nScreenshots: before not taken, found the change late\n"],
    ["CRLF line ends, as the web editor saves them", "Fixes the card.\r\n\r\n## Screenshots\r\n\r\n![picks](x.png)\r\n"],
  ])("passes with %s", (_, body) => {
    expect(screenshotsCheck(visual, body).ok).toBe(true);
  });

  test("skips a PR that touches neither folder", () => {
    const result = screenshotsCheck(["src/lib/spread.ts", "src/application.ts", ".github/workflows/x.yml"], "");
    expect(result.ok).toBe(true);
    expect(result.message).toBe("No file under src/app/ or src/components/ changed, so no screenshots are needed.");
  });

  test.each([
    ["the template's empty section", "## Screenshots\n\n<!-- A diff that touches src/app/ ... -->\n\n## Tests\n"],
    ["a section commented out", "<!--\n## Screenshots\n\n![picks](x.png)\n-->\n"],
    ["a reason line with no reason", "Screenshots: none,\n"],
    ["a reason line inside a sentence", "We wrote Screenshots: none, because it is a refactor.\n"],
    ["a deeper heading", "### Screenshots\n\n![picks](x.png)\n"],
  ])("fails with %s", (_, body) => {
    expect(screenshotsCheck(visual, body).ok).toBe(false);
  });
});
