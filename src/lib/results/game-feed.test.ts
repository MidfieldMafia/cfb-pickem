/**
 * The Game sheet's view of a feed at its interface: `gameFeed` over the
 * recorded Liberty at Coastal Carolina, read back as the sheet reads it.
 */
import { describe, expect, test } from "vitest";
import { LIBERTY_AT_COASTAL_FINAL } from "@/lib/cfbd/recorded";
import type { CfbdLiveDrive } from "@/lib/cfbd/types";
import { describePlays } from "./field";
import { downLabel, gameFeed, recentPlays, spotLabel, type FeedPlay, type GamePlaysJson, type Readout } from "./game-feed";

// Liberty at Coastal Carolina: Liberty (LIB, 2335) is away and attacks towards 100, Coastal (CCU, 324) home.
const TEAMS = { homeTeamId: 324, awayTeamId: 2335, homeTeam: "Coastal Carolina", awayTeam: "Liberty" };
const LABELS = { home: "CCU", away: "LIB" };
const DRIVES = LIBERTY_AT_COASTAL_FINAL.drives;
const id = (suffix: string) => `401869941${suffix}`;

const view = (drives: CfbdLiveDrive[]): GamePlaysJson =>
  gameFeed(
    {
      gameId: 1,
      fetchedAt: "2026-09-20T20:00:00.000Z",
      drives,
      descriptions: describePlays(
        drives.flatMap((drive) => drive.plays),
        TEAMS,
      ),
      final: null,
    },
    TEAMS,
  );

/** The endpoint's answer while the play ending in `suffix` was the newest. */
function feedThrough(suffix: string, drives: CfbdLiveDrive[] = DRIVES): GamePlaysJson {
  const kept: CfbdLiveDrive[] = [];
  for (const drive of drives) {
    const at = drive.plays.findIndex((play) => play.id === id(suffix));
    kept.push(at === -1 ? drive : { ...drive, plays: drive.plays.slice(0, at + 1) });
    if (at !== -1) break;
  }
  return view(kept);
}

/** The endpoint's answer while the drive at `index` was the newest. */
const feedUpTo = (index: number, drives: CfbdLiveDrive[] = DRIVES): GamePlaysJson => view(drives.slice(0, index + 1));

const WHOLE = feedThrough("349");

/** One play as the sheet receives it. */
function playOf(feed: GamePlaysJson, playId: string): FeedPlay {
  const play = feed.plays.find((p) => p.id === playId);
  if (!play) throw new Error(`no play ${playId}`);
  return play;
}

/** What the field reads once the play `playId` has landed. */
const readoutOf = (feed: GamePlaysJson, playId: string): Readout => playOf(feed, playId).readout;

describe("the labels", () => {
  test("are the feed's own abbreviations once it has placed them", () => {
    expect(WHOLE.labels).toEqual(LABELS);
  });

  test("count drives from 0, with -1 for a feed that has none", () => {
    expect(feedUpTo(8).drive).toBe(8);
    expect(feedUpTo(8).plays.at(-1)?.drive).toBe(8);
    expect(feedUpTo(0, []).drive).toBe(-1);
  });
});

describe("readout", () => {
  test("a play mid-drive: the down, the spot, and the drive so far", () => {
    // Coastal's drive from its own 25 after the touchback: 20-yard run to the LIB39.
    expect(readoutOf(WHOLE, id("21"))).toMatchObject({
      down: "1st & 10",
      spot: "LIB 39",
      drive: "3 plays, 36 yds",
      ball: 39,
      gain: 29,
      driveStart: 75,
      side: "home",
      unmoved: false,
    });
    expect(playOf(WHOLE, id("21")).gameClock).toBe("Q1 · 13:50");
  });

  test("a drive that has not moved shows the chevron", () => {
    // An incompletion on the first snap after the kickoff.
    expect(readoutOf(WHOLE, id("128"))).toMatchObject({
      down: "2nd & 10",
      drive: "1 play, 0 yds",
      unmoved: true,
    });
  });

  test("a kick starts the receiving team's drive", () => {
    expect(readoutOf(WHOLE, id("195"))).toMatchObject({
      down: "1st & 10",
      spot: "LIB 20",
      drive: "Just started",
      side: "away",
      unmoved: true,
    });
  });

  test("an interception starts a drive for the other side", () => {
    expect(readoutOf(WHOLE, id("29"))).toMatchObject({
      drive: "Just started",
      side: "away",
      driveStart: 20,
    });
  });

  test("a touchdown reads the kickoff next and the drive to the goal line", () => {
    expect(readoutOf(WHOLE, id("153"))).toMatchObject({
      down: "Kickoff",
      drive: "7 plays, 75 yds",
      gain: null,
      driveStart: null,
      unmoved: false,
    });
    expect(playOf(WHOLE, id("153")).score).toEqual({ home: 3, away: 10 });
  });

  test("a score keeps its end zone lit at rest", () => {
    expect(readoutOf(WHOLE, id("153")).flash).toEqual({ label: "Touchdown", yard: 100 });
    expect(readoutOf(WHOLE, id("122")).flash).toEqual({ label: "Field goal", yard: -10 });
    expect(readoutOf(WHOLE, id("21")).flash).toBeNull();
  });

  test("a turnover keeps its callout at rest, until the next drawn play", () => {
    const final = feedThrough(DRIVES.at(-1)!.plays.at(-1)!.id.slice(9));
    expect(readoutOf(WHOLE, id("29")).turnover).toEqual({ label: "Interception", yard: 20, side: "away" });
    expect(readoutOf(final, id("552")).turnover).toEqual({
      label: "Turnover on downs",
      yard: 55,
      side: "away",
    });
    expect(readoutOf(final, id("662")).turnover).toEqual({ label: "Fumble", yard: 59, side: "home" });
    const next = WHOLE.plays[WHOLE.plays.findIndex((play) => play.id === id("29")) + 1];
    expect(readoutOf(WHOLE, next.id).turnover).toBeNull();
    expect(readoutOf(WHOLE, id("153")).turnover).toBeNull();
  });

  test("goal to go", () => {
    // Liberty on the CCU8, 1st & 8.
    const game = feedThrough(DRIVES.at(-1)!.plays.at(-1)!.id.slice(9));
    expect(readoutOf(game, id("755"))).toMatchObject({ down: "1st & Goal", spot: "CCU 8", gain: 100 });
  });

  describe("a marker logged after a score keeps the score's drive (#391)", () => {
    /**
     * The recording with a marker logged after the play ending in `after`: in
     * the same drive, or at the head of the next one. The marker comes from
     * the defence, as a timeout before the kickoff usually does.
     */
    function withMarker(after: string, marker: { suffix: string; playType: string; playText: string; nextDrive?: boolean }) {
      const drives = DRIVES.map((drive) => {
        const at = drive.plays.findIndex((play) => play.id === id(after));
        if (at === -1) return drive;
        const score = drive.plays[at];
        const added = {
          ...score,
          id: id(marker.suffix),
          teamId: score.teamId === TEAMS.homeTeamId ? TEAMS.awayTeamId : TEAMS.homeTeamId,
          playType: marker.playType,
          playTypeId: 21, // CFBD's Timeout; only playType makes it a marker
          yardsGained: 0,
          playText: marker.playText,
        };
        return { ...drive, plays: [...drive.plays.slice(0, at + 1), added, ...drive.plays.slice(at + 1)] };
      });
      if (!marker.nextDrive) return drives;
      // Move it to the head of the drive after the score's.
      const from = drives.findIndex((drive) => drive.plays.some((play) => play.id === id(marker.suffix)));
      const moved = drives[from].plays.find((play) => play.id === id(marker.suffix))!;
      return drives.map((drive, i) =>
        i === from
          ? { ...drive, plays: drive.plays.filter((play) => play !== moved) }
          : i === from + 1
            ? { ...drive, plays: [moved, ...drive.plays] }
            : drive,
      );
    }

    test("a field goal then a timeout", () => {
      const scored = readoutOf(WHOLE, id("122"));
      const game = feedThrough("1221", withMarker("122", { suffix: "1221", playType: "Timeout", playText: "Timeout Liberty, clock 05:19" }));
      expect(readoutOf(game, id("1221"))).toMatchObject({
        drive: scored.drive,
        down: "Kickoff",
        flash: { label: "Field goal", yard: -10 },
      });
      expect(playOf(game, id("1221"))).toMatchObject({ text: "Timeout Liberty, clock 05:19", gameClock: "Q1 · 5:19" });
      expect(scored.drive).toMatch(/^\d+ plays, \d+ yds$/);
    });

    test("a touchdown then a timeout filed under the next drive", () => {
      const game = feedThrough(
        "1531",
        withMarker("153", { suffix: "1531", playType: "Timeout", playText: "Timeout Coastal Carolina, clock 03:13", nextDrive: true }),
      );
      expect(readoutOf(game, id("1531"))).toMatchObject({
        drive: readoutOf(WHOLE, id("153")).drive,
        down: "Kickoff",
        flash: { label: "Touchdown", yard: 100 },
      });
      expect(playOf(game, id("1531")).text).toBe("Timeout Coastal Carolina, clock 03:13");
    });

    test("a field goal then the end of the quarter", () => {
      const scored = readoutOf(WHOLE, id("122"));
      const game = feedThrough("1221", withMarker("122", { suffix: "1221", playType: "End Period", playText: "End of 1st Quarter" }));
      expect(readoutOf(game, id("1221")).drive).toBe(scored.drive);
      expect(playOf(game, id("1221")).text).toBe("End of 1st Quarter");
    });

    test("an interception then a timeout keeps the callout", () => {
      const game = feedThrough("291", withMarker("29", { suffix: "291", playType: "Timeout", playText: "Timeout Coastal Carolina, clock 13:05" }));
      expect(readoutOf(game, id("291")).turnover).toEqual({ label: "Interception", yard: 20, side: "away" });
    });

    test("a timeout mid-drive still reads the drive so far", () => {
      // Liberty's timeout after the incompletion on 2nd & 6 at the CCU8.
      expect(readoutOf(WHOLE, id("56")).drive).toBe(readoutOf(WHOLE, id("51")).drive);
    });
  });
});

describe("downLabel", () => {
  test("reads the down and the distance, or Goal once the distance reaches the goal line", () => {
    expect(downLabel(3, 7, 35)).toBe("3rd & 7");
    expect(downLabel(1, 8, 8)).toBe("1st & Goal");
    expect(downLabel(2, 10, null)).toBe("2nd & 10");
    expect(downLabel(4, null, 20)).toBe("4th & –");
  });
});

describe("spotLabel", () => {
  test("names the half the ball is in", () => {
    expect(spotLabel(28, LABELS)).toBe("LIB 28");
    expect(spotLabel(72, LABELS)).toBe("CCU 28");
    expect(spotLabel(50, LABELS)).toBe("50");
    expect(spotLabel(-3, LABELS)).toBe("End zone");
  });
});

describe("recentPlays", () => {
  test("lists the newest drive's plays, newest first", () => {
    const card = recentPlays(feedUpTo(8))!;
    expect(card.plays.map((play) => play.id)).toEqual(DRIVES[8].plays.map((play) => play.id).reverse());
  });

  test("tags a touchdown and carries the new score, extra point included, with the feed's abbreviations", () => {
    const card = recentPlays(feedUpTo(8))!;
    const touchdown = card.plays.find((play) => play.id === "401869941401")!;
    expect(touchdown.scored).toEqual({ tag: "Touchdown", line: "LIB 10–17 CCU" });
    expect(touchdown.clock).toBe("0:24");
  });

  test("tags a field goal", () => {
    const card = recentPlays(feedUpTo(1))!;
    expect(card.plays.find((play) => play.id === "40186994160")!.scored).toEqual({ tag: "Field goal", line: "LIB 3–0 CCU" });
  });

  test("leaves every play that did not score untagged, timeouts and period ends as plain rows", () => {
    const card = recentPlays(feedUpTo(9))!;
    const end = card.plays.find((play) => play.id === "401869941421")!;
    expect(end).toMatchObject({ text: "End of 2nd quarter.", scored: null });
    expect(recentPlays(feedUpTo(7))!.plays.filter((play) => play.scored !== null)).toEqual([]);
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
    const card = recentPlays(feedUpTo(8, drives))!;
    expect(card.plays[0]).toMatchObject({ id: "try", scored: { tag: "Extra point", line: "LIB 10–18 CCU" } });
  });

  test("closes with the previous drive's recap, the team labelled like the score tag", () => {
    expect(recentPlays(feedUpTo(9))!.recap).toBe("CCU · Touchdown · 8 plays, 80 yds, 1:08");
  });

  test("has no recap line on the first drive", () => {
    expect(recentPlays(feedUpTo(0))!.recap).toBeNull();
  });

  test("falls back to the team's name before the feed has placed an abbreviation", () => {
    // Two drives with their plays not logged yet: nothing has voted for an abbreviation.
    const feed = feedUpTo(1, DRIVES.slice(0, 2).map((drive) => ({ ...drive, plays: [] })));
    expect(feed.labels).toEqual({ home: "Coastal Carolina", away: "Liberty" });
    expect(recentPlays(feed)).toEqual({ plays: [], recap: "Coastal Carolina · Interception · 5 plays, 36 yds, 2:00" });
  });

  test("is empty, not missing, once the feed has been read but logged no play", () => {
    expect(recentPlays(feedUpTo(0, []))).toEqual({ plays: [], recap: null });
  });

  test("is null for a game the feed has never been read for", () => {
    expect(recentPlays({ ...feedUpTo(0, []), fetchedAt: null })).toBeNull();
  });
});
