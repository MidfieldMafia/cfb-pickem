import { describe, expect, test } from "vitest";
import { LIBERTY_AT_COASTAL_FINAL, LIBERTY_AT_COASTAL_Q2 } from "@/lib/cfbd/recorded";
import type { CfbdLiveDrive } from "@/lib/cfbd/types";
import { recapPreviousDrive, driveResult } from "./drive-recap";

// Liberty at Coastal Carolina: Liberty (2335) is away, Coastal (324) home.
const TEAMS = { homeTeamId: 324, awayTeamId: 2335 };
const DRIVES = LIBERTY_AT_COASTAL_FINAL.drives;

/** The feed as it stood while the drive at `index` was the newest. */
function upTo(index: number): CfbdLiveDrive[] {
  return DRIVES.slice(0, index + 1);
}

describe("recapPreviousDrive", () => {
  test("recaps the drive just before the newest one", () => {
    // Coastal's 80-yard touchdown drive, recapped once Liberty's next drive has started.
    expect(recapPreviousDrive(upTo(9), TEAMS)).toEqual({
      driveId: DRIVES[8].id,
      side: "home",
      result: "Touchdown",
      stats: "8 plays, 80 yds, 1:08",
    });
  });

  test("gives the offense as the away side for Liberty's drives", () => {
    expect(recapPreviousDrive(upTo(2), TEAMS)).toMatchObject({ side: "away", result: "Field goal" });
  });

  test("relabels Downs as a turnover on downs", () => {
    expect(recapPreviousDrive(upTo(14), TEAMS)).toMatchObject({
      result: "Turnover on downs",
      stats: "7 plays, 29 yds, 2:54",
    });
  });

  test("relabels End Of Half, and a one-play drive is singular", () => {
    expect(recapPreviousDrive(upTo(10), TEAMS)).toMatchObject({
      side: "away",
      result: "End of half",
      stats: "1 play, 8 yds, 0:17",
    });
  });

  test("a drive that went backwards keeps its negative yards, plural", () => {
    expect(recapPreviousDrive(upTo(16), TEAMS)).toMatchObject({ result: "Punt", stats: "5 plays, −9 yds, 2:18" });
  });

  test("a drive that gained nothing is plural", () => {
    expect(recapPreviousDrive(upTo(19), TEAMS)).toMatchObject({ result: "Punt", stats: "3 plays, 0 yds, 1:37" });
  });

  test("a finished drive with an empty result shows only the numbers", () => {
    expect(recapPreviousDrive(upTo(18), TEAMS)).toMatchObject({ result: null, stats: "3 plays, −3 yds, 2:13" });
  });

  test("a null part is dropped, never worked out", () => {
    const drives = upTo(18).map((drive, i) => (i === 17 ? { ...drive, duration: null } : drive));
    expect(recapPreviousDrive(drives, TEAMS)).toMatchObject({ result: null, stats: "3 plays, −3 yds" });
  });

  test("the final's last pair recaps the interception before the closing drive", () => {
    expect(recapPreviousDrive(DRIVES, TEAMS)).toMatchObject({
      side: "home",
      result: "Interception",
      stats: "2 plays, 26 yds, 0:29",
    });
  });

  test("an offense that is neither team has no side", () => {
    expect(recapPreviousDrive(upTo(9), { homeTeamId: 1, awayTeamId: 2 })).toMatchObject({ side: null });
  });

  test("no recap with fewer than two drives", () => {
    expect(LIBERTY_AT_COASTAL_Q2.drives).toHaveLength(1);
    expect(recapPreviousDrive(LIBERTY_AT_COASTAL_Q2.drives, TEAMS)).toBeNull();
    expect(recapPreviousDrive([], TEAMS)).toBeNull();
  });
});

describe("driveResult", () => {
  test.each([
    ["Touchdown", "Touchdown"],
    ["Field Goal", "Field goal"],
    ["Punt", "Punt"],
    ["Interception", "Interception"],
    ["Fumble", "Fumble"],
    ["Downs", "Turnover on downs"],
    ["End Of Half", "End of half"],
    ["End Of Quarter", "End of game"],
    ["Punt Return Touchdown", "Punt return touchdown"],
    ["SAFETY", "Safety"],
    ["", null],
    ["  ", null],
  ])("%j reads %j", (feed, shown) => {
    expect(driveResult(feed)).toBe(shown);
  });
});
