import { describe, expect, test } from "vitest";
import { attachLink, pngWidth, screenshotsSection } from "./pr-shots";

const names = ["after--leaderboard.png", "after--picks.png", "before--picks.png", "before--you.png"];

describe("screenshotsSection", () => {
  test("local links, with _new_ and _gone_ for a missing side", () => {
    expect(screenshotsSection(names, attachLink, { width: 390 })).toBe(
      [
        "## Screenshots",
        "",
        "_The fake `agent-db` league at 390px. Before is `main`, after is this branch._",
        "",
        "| Screen | Before | After |",
        "|---|---|---|",
        "| `leaderboard` | _new_ | ![leaderboard](./after--leaderboard.png) |",
        "| `picks` | ![picks](./before--picks.png) | ![picks](./after--picks.png) |",
        "| `you` | ![you](./before--you.png) | _gone_ |",
      ].join("\n"),
    );
  });

  test("the caption names the member and state when given", () => {
    const section = screenshotsSection(["after--live.png"], (name) => name, {
      width: 360,
      member: "Casey",
      state: "Week 7 locked, Liberty at Coastal Carolina in Q2",
    });
    expect(section.split("\n")[2]).toBe(
      "_The fake `agent-db` league at 360px, signed in as Casey, Week 7 locked, Liberty at Coastal Carolina in Q2. Before is `main`, after is this branch._",
    );
  });

  test("files that are not shots are left out", () => {
    const section = screenshotsSection(["skipped.txt", "before--Picks.png", "after--picks.png"], (name) => name, {
      width: 390,
    });
    expect(section.split("\n").slice(6)).toEqual(["| `picks` | _new_ | after--picks.png |"]);
  });
});

describe("pngWidth", () => {
  test("reads the IHDR width, halved for the 2x shots shoot.cjs takes", () => {
    // A PNG signature, then IHDR: length, type, width 780, height 1688.
    const png = Buffer.from("89504e470d0a1a0a0000000d494844520000030c00000698", "hex");
    expect(pngWidth(png)).toBe(390);
  });

  test("is null for a file that is not a PNG", () => {
    expect(pngWidth(Buffer.from("not a png at all, not at all"))).toBeNull();
  });
});
