/**
 * The Week strip's rules from #243: which view opens, which tiles carry a
 * trophy or the live mark, what each tile says to a screen reader, and the
 * games-left line on the card back to the Live Board.
 */
import { describe, expect, test } from "vitest";
import type { GameResult } from "@/lib/results/result";
import type { GradedWeek, LeaderboardRow, WeeklyScore } from "@/lib/results/results";
import { gamesLeftLabel, revealHref, SEASON_PARAM, selectedWeek, stripTiles, weekInProgress } from "./week-view";

const ME = 1;

function member(id: number) {
  return { id, displayName: `Member ${id}`, avatarId: null };
}

function score(id: number, points: number, played = true): WeeklyScore {
  return {
    member: member(id),
    played,
    points,
    correct: 0,
    incorrect: 0,
    pending: 0,
    lockGameId: null,
    lockDropped: false,
    tiebreakerGuess: null,
    tiebreakerError: null,
  };
}

function week(weekNumber: number, complete: boolean, scores: WeeklyScore[] = [], winner?: number): GradedWeek {
  return {
    week: { id: 100 + weekNumber, weekNumber } as GradedWeek["week"],
    complete,
    scores,
    weeklyWin: winner === undefined ? null : { winners: [member(winner)], points: 0, decidedBy: "points" } as GradedWeek["weeklyWin"],
  };
}

function row(id: number, rank: number): LeaderboardRow {
  return {
    member: member(id),
    rank,
    previousRank: null,
    totalPoints: 0,
    correct: 0,
    incorrect: 0,
    weeklyWins: 0,
    weeksPlayed: 1,
    averagePoints: 0,
    cumulativeTiebreakerError: 0,
    averageTiebreakerMiss: 0,
  };
}

describe("the view the Leaderboard opens on", () => {
  const settled = [week(1, true), week(2, true)];
  const saturday = [week(1, true), week(2, true), week(3, false)];

  test("opens on the Week in progress while its games are going", () => {
    expect(selectedWeek(saturday, undefined)?.week.weekNumber).toBe(3);
  });

  test("opens on Season once every Week is final", () => {
    expect(selectedWeek(settled, undefined)).toBeNull();
  });

  test("?week= still chooses any played Week", () => {
    expect(selectedWeek(saturday, "1")?.week.weekNumber).toBe(1);
  });

  test("?week=season holds Season even while a Week is in progress", () => {
    expect(selectedWeek(saturday, SEASON_PARAM)).toBeNull();
  });

  test("a Week that has not been played falls back to the default", () => {
    expect(selectedWeek(saturday, "9")?.week.weekNumber).toBe(3);
    expect(selectedWeek(settled, "9")).toBeNull();
  });

  test("only the latest Week can be in progress, so an old unfinished one does not take over", () => {
    expect(weekInProgress([week(1, false), week(2, true)])).toBeNull();
  });
});

describe("the tiles", () => {
  const played = [
    week(1, true, [score(ME, 30), score(2, 20)], ME),
    week(2, true, [score(ME, 0, false), score(2, 40)], 2),
    week(3, false, [score(ME, 20), score(2, 10)], ME),
  ];
  const tiles = stripTiles({
    year: 2026,
    played,
    leaderboard: [row(2, 1), row(ME, 3)],
    viewerId: ME,
    shown: played[2],
  });

  test("Season first, then the Weeks newest first", () => {
    expect(tiles.map((t) => t.title)).toEqual(["Season", "3", "2", "1"]);
    expect(tiles.map((t) => t.caption)).toEqual(["2026", "Wk", "Wk", "Wk"]);
  });

  test("Season shows the viewer's place; Weeks show no score", () => {
    expect(tiles.map((t) => t.place)).toEqual(["3rd", null, null, null]);
  });

  test("a trophy only on a finished Week the viewer won, the live mark only on the Week in progress", () => {
    expect(tiles.map((t) => t.won)).toEqual([false, false, false, true]);
    expect(tiles.map((t) => t.live)).toEqual([false, true, false, false]);
  });

  test("the selected tile is the Week on screen, and links name their view", () => {
    expect(tiles.map((t) => t.current)).toEqual([false, true, false, false]);
    expect(tiles.map((t) => t.href)).toEqual([
      "/leaderboard?week=season",
      "/leaderboard?week=3",
      "/leaderboard?week=2",
      "/leaderboard?week=1",
    ]);
  });

  test("each tile says what it holds", () => {
    expect(tiles.map((t) => t.label)).toEqual([
      "Season standings, you are 3rd",
      "Week 3, in progress, you have 20",
      "Week 2, you made no picks",
      "Week 1, you scored 30, Week winner",
    ]);
  });

  test("a viewer who was not on a Week's board gets its number alone", () => {
    const [, only] = stripTiles({ year: 2026, played: [week(1, true, [score(2, 10)])], leaderboard: [], viewerId: ME, shown: null });
    expect(only.label).toBe("Week 1");
  });
});

describe("the games left in a Week in progress", () => {
  const live = { status: "pending", live: { homeScore: 7, awayScore: 3 } } as unknown as GameResult;
  const toCome = { status: "pending", live: null } as unknown as GameResult;
  const final = { status: "final", live: null } as unknown as GameResult;
  const voided = { status: "void", live: null } as unknown as GameResult;

  test("counts live games and games to kick off, and nothing that is over", () => {
    expect(gamesLeftLabel([live, live, toCome, final, voided])).toBe("2 games live · 1 to kick off");
  });

  test("says 'game' once, on whichever half comes first", () => {
    expect(gamesLeftLabel([live])).toBe("1 game live");
    expect(gamesLeftLabel([toCome, toCome])).toBe("2 games to kick off");
  });
});

describe("the Reveal card under a Week's standings", () => {
  test("a finished Week links to its own Reveal", () => {
    expect(revealHref(week(2, true))).toBe("/leaderboard/reveal?week=2");
  });

  test("Season and a Week in progress have no card", () => {
    expect(revealHref(null)).toBeNull();
    expect(revealHref(week(3, false))).toBeNull();
  });
});
