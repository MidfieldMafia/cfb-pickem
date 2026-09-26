import { describe, expect, test } from "vitest";
import { LIBERTY_AT_COASTAL_FINAL } from "@/lib/cfbd/recorded";
import type { CfbdLiveDrive } from "@/lib/cfbd/types";
import { recapPreviousDrive } from "./drive-recap";
import { describePlays } from "./field";
import type { GamePlaysJson } from "./live-feed";
import { recentPlays } from "./recent-plays";

// Liberty at Coastal Carolina: Liberty (2335) is away, Coastal (324) home.
const TEAMS = { homeTeamId: 324, awayTeamId: 2335, homeTeam: "Coastal Carolina", awayTeam: "Liberty" };
const DRIVES = LIBERTY_AT_COASTAL_FINAL.drives;

/** The endpoint's answer while the drive at `index` was the newest. */
function feedUpTo(index: number, drives: CfbdLiveDrive[] = DRIVES): GamePlaysJson {
  const upTo = drives.slice(0, index + 1);
  return {
    gameId: 1,
    fetchedAt: "2026-09-20T20:00:00.000Z",
    drives: upTo,
    descriptions: describePlays(
      upTo.flatMap((drive) => drive.plays),
      TEAMS,
    ),
    recap: recapPreviousDrive(upTo, TEAMS),
    final: null,
  };
}

describe("recentPlays", () => {
  test("lists the newest drive's plays, newest first", () => {
    const card = recentPlays(feedUpTo(8), TEAMS)!;
    expect(card.plays.map((play) => play.id)).toEqual(DRIVES[8].plays.map((play) => play.id).reverse());
  });

  test("tags a touchdown and carries the new score, extra point included, with the feed's abbreviations", () => {
    const card = recentPlays(feedUpTo(8), TEAMS)!;
    const touchdown = card.plays.find((play) => play.id === "401869941401")!;
    expect(touchdown.score).toEqual({ tag: "Touchdown", line: "LIB 10–17 CCU" });
    expect(touchdown.clock).toBe("0:24");
  });

  test("tags a field goal", () => {
    const card = recentPlays(feedUpTo(1), TEAMS)!;
    expect(card.plays.find((play) => play.id === "40186994160")!.score).toEqual({ tag: "Field goal", line: "LIB 3–0 CCU" });
  });

  test("leaves every play that did not score untagged, timeouts and period ends as plain rows", () => {
    const card = recentPlays(feedUpTo(9), TEAMS)!;
    const end = card.plays.find((play) => play.id === "401869941421")!;
    expect(end).toMatchObject({ text: "End of 2nd quarter.", score: null });
    expect(recentPlays(feedUpTo(7), TEAMS)!.plays.filter((play) => play.score !== null)).toEqual([]);
  });

  test("a score the field drew no flash for is the try, logged as a play of its own", () => {
    const drives = DRIVES.slice(0, 9).map((drive, i) =>
      i === 8
        ? {
            ...drive,
            plays: [
              ...drive.plays,
              {
                ...drive.plays.at(-1)!,
                id: "try",
                playType: "Extra Point Good",
                playText: "B.Kicker extra point GOOD",
                homeScore: 18,
              },
            ],
          }
        : drive,
    );
    const card = recentPlays(feedUpTo(8, drives), TEAMS)!;
    expect(card.plays[0]).toMatchObject({ id: "try", score: { tag: "Extra point", line: "LIB 10–18 CCU" } });
  });

  test("closes with the previous drive's recap, the team labelled like the score tag", () => {
    expect(recentPlays(feedUpTo(9), TEAMS)!.recap).toBe("CCU · Touchdown · 8 plays, 80 yds, 1:08");
  });

  test("has no recap line on the first drive", () => {
    expect(recentPlays(feedUpTo(0), TEAMS)!.recap).toBeNull();
  });

  test("falls back to the team's name before the feed has placed an abbreviation", () => {
    const feed = { ...feedUpTo(0), drives: [], descriptions: [], recap: recapPreviousDrive(DRIVES.slice(0, 2), TEAMS) };
    expect(recentPlays(feed, TEAMS)).toEqual({ plays: [], recap: "Coastal Carolina · Interception · 5 plays, 36 yds, 2:00" });
  });

  test("is empty, not missing, once the feed has been read but logged no play", () => {
    expect(recentPlays({ ...feedUpTo(0), drives: [], descriptions: [], recap: null }, TEAMS)).toEqual({
      plays: [],
      recap: null,
    });
  });

  test("is null for a game the feed has never been read for", () => {
    expect(recentPlays({ ...feedUpTo(0), fetchedAt: null, drives: [], descriptions: [], recap: null }, TEAMS)).toBeNull();
  });
});
