import { describe, expect, it } from "vitest";
import { scoreSeason } from "./index";
import { finalGame, rules2026, week } from "./fixtures/build";
import type { Game, Member } from "./types";

const members: Member[] = [
  { id: "jonah", joinedAt: "2026-08-01T00:00:00Z" },
  { id: "alex", joinedAt: "2026-08-01T00:00:00Z" },
  { id: "grandma", joinedAt: "2026-09-08T00:00:00Z" },
];

describe("scoreSeason", () => {
  it("totals points and record across weeks and averages over weeks played since joining", () => {
    const week1 = week({
      weekNumber: 1,
      deadline: "2026-09-05T16:00:00Z",
      games: [finalGame("w1g1", "Georgia", "Clemson", 31, 17), finalGame("w1g2", "Ohio State", "Texas", 14, 24)],
      picks: [
        { memberId: "jonah", gameId: "w1g1", team: "Georgia" },
        { memberId: "jonah", gameId: "w1g2", team: "Texas" },
        { memberId: "alex", gameId: "w1g1", team: "Clemson" },
        { memberId: "alex", gameId: "w1g2", team: "Texas" },
      ],
    });
    const week2 = week({
      weekNumber: 2,
      deadline: "2026-09-12T16:00:00Z",
      games: [finalGame("w2g1", "Alabama", "LSU", 21, 28), finalGame("w2g2", "Michigan", "Oregon", 10, 7)],
      picks: [
        { memberId: "jonah", gameId: "w2g1", team: "Alabama" },
        { memberId: "jonah", gameId: "w2g2", team: "Michigan" },
        { memberId: "alex", gameId: "w2g1", team: "LSU" },
        { memberId: "alex", gameId: "w2g2", team: "Oregon" },
        { memberId: "grandma", gameId: "w2g1", team: "LSU" },
        { memberId: "grandma", gameId: "w2g2", team: "Michigan" },
      ],
      locks: [{ memberId: "grandma", gameId: "w2g2" }],
    });

    const { leaderboard } = scoreSeason(rules2026, [week1, week2], members);

    const row = (id: string) => leaderboard.find((r) => r.memberId === id)!;
    expect(row("jonah")).toMatchObject({ totalPoints: 30, correct: 3, incorrect: 1, weeksPlayed: 2, averagePoints: 15 });
    expect(row("alex")).toMatchObject({ totalPoints: 20, correct: 2, incorrect: 2, weeksPlayed: 2, averagePoints: 10 });
    expect(row("grandma")).toMatchObject({ totalPoints: 30, correct: 2, incorrect: 0, weeksPlayed: 1, averagePoints: 30 });
  });

  it("counts Weekly Wins and cumulative tiebreaker error from completed weeks only", () => {
    const week1 = week({
      weekNumber: 1,
      deadline: "2026-09-05T16:00:00Z",
      tiebreakerGameId: "w1g1",
      games: [finalGame("w1g1", "Georgia", "Clemson", 31, 17)],
      picks: [
        { memberId: "jonah", gameId: "w1g1", team: "Georgia" },
        { memberId: "alex", gameId: "w1g1", team: "Georgia" },
      ],
      tiebreakerGuesses: [
        { memberId: "jonah", guess: 50 },
        { memberId: "alex", guess: 44 },
      ],
    });
    const liveGame: Game = { id: "w2g1", homeTeam: "Alabama", awayTeam: "LSU", homeScore: 7, awayScore: 0, status: "in_progress", void: false };
    const week2 = week({
      weekNumber: 2,
      deadline: "2026-09-12T16:00:00Z",
      tiebreakerGameId: "w2g1",
      games: [liveGame],
      picks: [{ memberId: "jonah", gameId: "w2g1", team: "Alabama" }],
      tiebreakerGuesses: [{ memberId: "jonah", guess: 60 }],
    });

    const { leaderboard } = scoreSeason(rules2026, [week1, week2], members.slice(0, 2));

    const row = (id: string) => leaderboard.find((r) => r.memberId === id)!;
    // Week 1 total is 48: Jonah is 2 off, Alex is 4 off. Week 2 is still live so it counts for nothing here.
    expect(row("jonah")).toMatchObject({ weeklyWins: 1, cumulativeTiebreakerError: 2 });
    expect(row("alex")).toMatchObject({ weeklyWins: 0, cumulativeTiebreakerError: 4 });
  });

  it("orders by total points, then weekly wins, then lowest cumulative tiebreaker error, sharing ranks on full ties", () => {
    const four: Member[] = [
      { id: "a", joinedAt: "2026-08-01T00:00:00Z" },
      { id: "b", joinedAt: "2026-08-01T00:00:00Z" },
      { id: "c", joinedAt: "2026-08-01T00:00:00Z" },
      { id: "d", joinedAt: "2026-08-01T00:00:00Z" },
    ];
    // Week 1: a and b get 10, c and d get 0. Tiebreaker total 48. a guesses 48 (error 0) and wins outright on the tiebreak.
    const week1 = week({
      weekNumber: 1,
      deadline: "2026-09-05T16:00:00Z",
      tiebreakerGameId: "w1g1",
      games: [finalGame("w1g1", "Georgia", "Clemson", 31, 17)],
      picks: [
        { memberId: "a", gameId: "w1g1", team: "Georgia" },
        { memberId: "b", gameId: "w1g1", team: "Georgia" },
        { memberId: "c", gameId: "w1g1", team: "Clemson" },
        { memberId: "d", gameId: "w1g1", team: "Clemson" },
      ],
      tiebreakerGuesses: [
        { memberId: "a", guess: 48 },
        { memberId: "b", guess: 40 },
        { memberId: "c", guess: 38 },
        { memberId: "d", guess: 38 },
      ],
    });
    // Week 2: c and d get 10, a and b get 0. Tiebreaker total 20. c and d both guess 20, so they share the win.
    const week2 = week({
      weekNumber: 2,
      deadline: "2026-09-12T16:00:00Z",
      tiebreakerGameId: "w2g1",
      games: [finalGame("w2g1", "Alabama", "LSU", 13, 7)],
      picks: [
        { memberId: "a", gameId: "w2g1", team: "LSU" },
        { memberId: "b", gameId: "w2g1", team: "LSU" },
        { memberId: "c", gameId: "w2g1", team: "Alabama" },
        { memberId: "d", gameId: "w2g1", team: "Alabama" },
      ],
      tiebreakerGuesses: [
        { memberId: "a", guess: 20 },
        { memberId: "b", guess: 20 },
        { memberId: "c", guess: 20 },
        { memberId: "d", guess: 20 },
      ],
    });

    const { leaderboard } = scoreSeason(rules2026, [week1, week2], four);

    // Everyone has 10 points. Wins: a 1, b 0, c 1, d 1. Errors: a 0, b 8, c 10, d 10.
    expect(leaderboard.map((r) => [r.memberId, r.rank])).toEqual([
      ["a", 1],
      ["c", 2],
      ["d", 2],
      ["b", 4],
    ]);
  });

  it("ignores unpublished weeks entirely", () => {
    const published = week({
      weekNumber: 1,
      deadline: "2026-09-05T16:00:00Z",
      games: [finalGame("w1g1", "Georgia", "Clemson", 31, 17)],
      picks: [{ memberId: "jonah", gameId: "w1g1", team: "Georgia" }],
    });
    const draft = week({
      weekNumber: 2,
      deadline: "2026-09-12T16:00:00Z",
      published: false,
      games: [finalGame("w2g1", "Alabama", "LSU", 13, 7)],
      picks: [{ memberId: "alex", gameId: "w2g1", team: "Alabama" }],
    });

    const { weeks, leaderboard } = scoreSeason(rules2026, [published, draft], members.slice(0, 2));

    expect(weeks.map((w) => w.weekNumber)).toEqual([1]);
    expect(leaderboard.find((r) => r.memberId === "alex")).toMatchObject({ totalPoints: 0, weeksPlayed: 1, averagePoints: 0 });
  });
});

/**
 * Grandma joins on 2026-09-08: after Week 1's Deadline and before Week 2's, so
 * Week 2 is her first counted week and the Week 1 board is one she was never on.
 */
const movementWeek1 = week({
  weekNumber: 1,
  deadline: "2026-09-05T16:00:00Z",
  games: [finalGame("w1g1", "Georgia", "Clemson", 31, 17), finalGame("w1g2", "Ohio State", "Texas", 14, 24)],
  picks: [
    // Alex takes both and leads on 20; Jonah takes one and sits second on 10.
    { memberId: "alex", gameId: "w1g1", team: "Georgia" },
    { memberId: "alex", gameId: "w1g2", team: "Texas" },
    { memberId: "jonah", gameId: "w1g1", team: "Georgia" },
    { memberId: "jonah", gameId: "w1g2", team: "Ohio State" },
  ],
});

const movementWeek2 = week({
  weekNumber: 2,
  deadline: "2026-09-12T16:00:00Z",
  games: [finalGame("w2g1", "Alabama", "LSU", 28, 21), finalGame("w2g2", "Michigan", "Oregon", 10, 7)],
  picks: [
    // Jonah takes both with the Lock on one — 30 — and passes Alex, who takes none.
    { memberId: "jonah", gameId: "w2g1", team: "Alabama" },
    { memberId: "jonah", gameId: "w2g2", team: "Michigan" },
    { memberId: "alex", gameId: "w2g1", team: "LSU" },
    { memberId: "alex", gameId: "w2g2", team: "Oregon" },
    { memberId: "grandma", gameId: "w2g1", team: "Alabama" },
    { memberId: "grandma", gameId: "w2g2", team: "Oregon" },
  ],
  locks: [{ memberId: "jonah", gameId: "w2g1" }],
});

describe("scoreSeason previousRank", () => {
  it("ranks the board as it stood before the latest week", () => {
    const { leaderboard } = scoreSeason(rules2026, [movementWeek1, movementWeek2], members);

    // Totals: Jonah 40, Alex 20, Grandma 10. Before Week 2: Alex 20, Jonah 10.
    expect(leaderboard.map((r) => [r.memberId, r.rank, r.previousRank])).toEqual([
      ["jonah", 1, 2],
      ["alex", 2, 1],
      // Week 2 is Grandma's first counted week, so she climbed from no place at all.
      ["grandma", 3, null],
    ]);
  });

  it("has no earlier board to compare against in the first week of the season", () => {
    const { leaderboard } = scoreSeason(rules2026, [movementWeek1], members);

    expect(leaderboard.every((r) => r.previousRank === null)).toBe(true);
  });

  it("takes the latest week by week number, not by the order the weeks arrive in", () => {
    const forwards = scoreSeason(rules2026, [movementWeek1, movementWeek2], members);
    const backwards = scoreSeason(rules2026, [movementWeek2, movementWeek1], members);

    const ranks = (result: typeof forwards) =>
      result.leaderboard.map((r) => [r.memberId, r.rank, r.previousRank]);
    expect(ranks(backwards)).toEqual(ranks(forwards));
  });

  it("leaves a member who held their place with a previousRank equal to their rank", () => {
    // Nobody scores in Week 2, so the Week 1 board stands and every place holds.
    const quiet = week({ weekNumber: 2, deadline: "2026-09-12T16:00:00Z" });
    const { leaderboard } = scoreSeason(rules2026, [movementWeek1, quiet], members.slice(0, 2));

    expect(leaderboard.map((r) => [r.memberId, r.rank, r.previousRank])).toEqual([
      ["alex", 1, 1],
      ["jonah", 2, 2],
    ]);
  });
});
