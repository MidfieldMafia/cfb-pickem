/**
 * The four sortable Leaderboard columns (#134, #336): each sorts best-first on the
 * first tap, reversed on the second, with dash rows (no graded pick yet, no
 * Tiebreaker Guess miss to average) sinking last regardless of direction —
 * the same partition-then-sort-then-reverse shape as
 * `src/app/console/slate/candidate-sort.ts`.
 */
import { describe, expect, test } from "vitest";
import type { LeaderboardRow } from "@/lib/results/results";
import { sortLeaderboard } from "./leaderboard-sort";

function member(id: number) {
  return { id, displayName: `Member ${id}`, avatarId: null };
}

function row(id: number, overrides: Partial<LeaderboardRow> = {}): LeaderboardRow {
  return {
    member: member(id),
    rank: id,
    previousRank: null,
    totalPoints: 0,
    correct: 0,
    incorrect: 0,
    weeklyWins: 0,
    weeksPlayed: 0,
    averagePoints: null,
    cumulativeTiebreakerError: 0,
    averageTiebreakerMiss: null,
    ...overrides,
  };
}

describe("sorting by points", () => {
  test("asc is best-first: highest points first", () => {
    const rows = [row(1, { totalPoints: 10 }), row(2, { totalPoints: 30 }), row(3, { totalPoints: 20 })];
    const sorted = sortLeaderboard(rows, "points", "asc");
    expect(sorted.map((r) => r.member.id)).toEqual([2, 3, 1]);
  });

  test("desc reverses it: lowest points first", () => {
    const rows = [row(1, { totalPoints: 10 }), row(2, { totalPoints: 30 }), row(3, { totalPoints: 20 })];
    const sorted = sortLeaderboard(rows, "points", "desc");
    expect(sorted.map((r) => r.member.id)).toEqual([1, 3, 2]);
  });
});

describe("sorting by Win% (correct over graded picks)", () => {
  // Member 1 has the most correct picks but the lowest rate: the rate is what sorts.
  const rows = [
    row(1, { correct: 12, incorrect: 12 }),
    row(2, { correct: 9, incorrect: 1 }),
    row(3, { correct: 7, incorrect: 3 }),
  ];

  test("asc is best-first: highest rate first, not most correct", () => {
    const sorted = sortLeaderboard(rows, "winRate", "asc");
    expect(sorted.map((r) => r.member.id)).toEqual([2, 3, 1]);
  });

  test("desc reverses it", () => {
    const sorted = sortLeaderboard(rows, "winRate", "desc");
    expect(sorted.map((r) => r.member.id)).toEqual([1, 3, 2]);
  });

  test("a dash (no graded pick yet) sorts last regardless of direction", () => {
    const withADash = [row(1, { correct: 3, incorrect: 1 }), row(2), row(3, { correct: 1, incorrect: 1 })];
    for (const dir of ["asc", "desc"] as const) {
      const sorted = sortLeaderboard(withADash, "winRate", dir);
      expect(sorted.at(-1)!.member.id).toBe(2);
    }
  });
});

describe("sorting by Wins (Weekly Wins)", () => {
  test("asc is best-first: most Weekly Wins first", () => {
    const rows = [row(1, { weeklyWins: 1 }), row(2, { weeklyWins: 4 }), row(3, { weeklyWins: 2 })];
    const sorted = sortLeaderboard(rows, "wins", "asc");
    expect(sorted.map((r) => r.member.id)).toEqual([2, 3, 1]);
  });

  test("desc reverses it", () => {
    const rows = [row(1, { weeklyWins: 1 }), row(2, { weeklyWins: 4 }), row(3, { weeklyWins: 2 })];
    const sorted = sortLeaderboard(rows, "wins", "desc");
    expect(sorted.map((r) => r.member.id)).toEqual([1, 3, 2]);
  });
});

describe("sorting by Miss (average Tiebreaker Guess miss, lower is better)", () => {
  test("asc is best-first: lowest miss first", () => {
    const rows = [
      row(1, { averageTiebreakerMiss: 8 }),
      row(2, { averageTiebreakerMiss: 1 }),
      row(3, { averageTiebreakerMiss: 4 }),
    ];
    const sorted = sortLeaderboard(rows, "miss", "asc");
    expect(sorted.map((r) => r.member.id)).toEqual([2, 3, 1]);
  });

  test("desc reverses the placed rows", () => {
    const rows = [
      row(1, { averageTiebreakerMiss: 8 }),
      row(2, { averageTiebreakerMiss: 1 }),
      row(3, { averageTiebreakerMiss: 4 }),
    ];
    const sorted = sortLeaderboard(rows, "miss", "desc");
    expect(sorted.map((r) => r.member.id)).toEqual([1, 3, 2]);
  });

  test("a dash (no Tiebreaker Guess ever completed) sorts last regardless of direction", () => {
    const rows = [
      row(1, { averageTiebreakerMiss: 8 }),
      row(2, { averageTiebreakerMiss: null }),
      row(3, { averageTiebreakerMiss: 4 }),
    ];
    for (const dir of ["asc", "desc"] as const) {
      const sorted = sortLeaderboard(rows, "miss", dir);
      expect(sorted.at(-1)!.member.id).toBe(2);
    }
  });
});
