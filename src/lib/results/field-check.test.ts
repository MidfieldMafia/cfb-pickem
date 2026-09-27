import { describe, expect, test } from "vitest";
import { LIBERTY_AT_COASTAL_FINAL } from "@/lib/cfbd/recorded";
import { checkField } from "./field-check";

const TEAMS = { homeTeamId: 324, awayTeamId: 2335 };
const PLAYS = LIBERTY_AT_COASTAL_FINAL.drives.flatMap((drive) => drive.plays);

describe("checkField", () => {
  test("a game the parser reads places both teams and draws no run or catch as a jump", () => {
    const check = checkField(PLAYS, TEAMS);
    expect(check.unplaced).toEqual([]);
    expect(check.jumpOnly).toBe(0);
    expect(check.samples).toEqual([]);
    expect(check.runsAndCatches).toBeGreaterThan(0);
  });

  test("a spelling the parser can't read names the team it can't place, with the plays that show it", () => {
    // Coastal's spots written as a name too long for an abbreviation.
    const plays = PLAYS.map((p) => ({ ...p, playText: p.playText.replace(/\bCCU(\d{2})/g, "Coastal Carolina $1") }));
    const check = checkField(plays, TEAMS);
    expect(check.unplaced).toEqual(["home"]);
    expect(check.jumpOnly).toBeGreaterThan(0);
    expect(check.samples.length).toBeGreaterThan(0);
    expect(check.samples.length).toBeLessThanOrEqual(3);
    for (const sample of check.samples) expect(sample).toContain("Coastal Carolina");
  });

  test("a game with no plays yet has nothing to report", () => {
    expect(checkField([], TEAMS)).toEqual({ unplaced: [], runsAndCatches: 0, jumpOnly: 0, samples: [] });
  });
});
