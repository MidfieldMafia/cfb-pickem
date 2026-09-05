import { describe, expect, it } from "vitest";
import { scoreWeek } from "./score-week";
import type { Game, Member, Rules, Week } from "./types";

const rules: Rules = { pointsPerCorrectPick: 10, lockMultiplier: 2 };

const members: Member[] = [
  { id: "jonah", joinedAt: "2026-08-01T00:00:00Z" },
  { id: "alex", joinedAt: "2026-08-01T00:00:00Z" },
];

function finalGame(id: string, home: string, away: string, homeScore: number, awayScore: number): Game {
  return { id, homeTeam: home, awayTeam: away, homeScore, awayScore, status: "final", void: false };
}

function week(overrides: Partial<Week>): Week {
  return {
    weekNumber: 1,
    deadline: "2026-09-05T16:00:00Z",
    published: true,
    tiebreakerGameId: null,
    games: [],
    picks: [],
    locks: [],
    tiebreakerGuesses: [],
    ...overrides,
  };
}

describe("scoreWeek", () => {
  it("awards 10 points per correct pick and 0 for an incorrect pick", () => {
    const result = scoreWeek(
      rules,
      week({
        games: [finalGame("g1", "Georgia", "Clemson", 31, 17), finalGame("g2", "Ohio State", "Texas", 14, 24)],
        picks: [
          { memberId: "jonah", gameId: "g1", team: "Georgia" },
          { memberId: "jonah", gameId: "g2", team: "Ohio State" },
        ],
      }),
      members,
    );

    const jonah = result.scores.find((s) => s.memberId === "jonah")!;
    expect(jonah.points).toBe(10);
    expect(jonah.picks).toEqual([
      { gameId: "g1", team: "Georgia", outcome: "correct", locked: false, points: 10 },
      { gameId: "g2", team: "Ohio State", outcome: "incorrect", locked: false, points: 0 },
    ]);
  });

  it("scores unpicked games as 0 without blocking the member", () => {
    const result = scoreWeek(
      rules,
      week({
        games: [finalGame("g1", "Georgia", "Clemson", 31, 17), finalGame("g2", "Ohio State", "Texas", 14, 24)],
        picks: [{ memberId: "alex", gameId: "g2", team: "Texas" }],
      }),
      members,
    );

    const alex = result.scores.find((s) => s.memberId === "alex")!;
    expect(alex.points).toBe(10);
    expect(alex.picks[0]).toEqual({ gameId: "g1", team: null, outcome: "unpicked", locked: false, points: 0 });
    expect(alex.correct).toBe(1);
    expect(alex.incorrect).toBe(0);
  });

  it("scores a correct Lock of the Week at 20 and an incorrect Lock at 0", () => {
    const result = scoreWeek(
      rules,
      week({
        games: [finalGame("g1", "Georgia", "Clemson", 31, 17), finalGame("g2", "Ohio State", "Texas", 14, 24)],
        picks: [
          { memberId: "jonah", gameId: "g1", team: "Georgia" },
          { memberId: "jonah", gameId: "g2", team: "Texas" },
          { memberId: "alex", gameId: "g1", team: "Georgia" },
          { memberId: "alex", gameId: "g2", team: "Ohio State" },
        ],
        locks: [
          { memberId: "jonah", gameId: "g1" },
          { memberId: "alex", gameId: "g2" },
        ],
      }),
      members,
    );

    const jonah = result.scores.find((s) => s.memberId === "jonah")!;
    expect(jonah.points).toBe(30);
    expect(jonah.picks[0]).toEqual({ gameId: "g1", team: "Georgia", outcome: "correct", locked: true, points: 20 });
    expect(jonah.lock).toEqual({ gameId: "g1", dropped: false });

    const alex = result.scores.find((s) => s.memberId === "alex")!;
    expect(alex.points).toBe(10);
    expect(alex.picks[1]).toEqual({ gameId: "g2", team: "Ohio State", outcome: "incorrect", locked: true, points: 0 });
  });

  it("scores a Void game as 0 for everyone and drops a Lock placed on it", () => {
    const voided: Game = { ...finalGame("g1", "Georgia", "Clemson", 31, 17), void: true };
    const result = scoreWeek(
      rules,
      week({
        games: [voided, finalGame("g2", "Ohio State", "Texas", 14, 24)],
        picks: [
          { memberId: "jonah", gameId: "g1", team: "Georgia" },
          { memberId: "jonah", gameId: "g2", team: "Texas" },
          { memberId: "alex", gameId: "g2", team: "Texas" },
        ],
        locks: [{ memberId: "jonah", gameId: "g1" }],
      }),
      members,
    );

    const jonah = result.scores.find((s) => s.memberId === "jonah")!;
    expect(jonah.points).toBe(10);
    expect(jonah.picks[0]).toEqual({ gameId: "g1", team: "Georgia", outcome: "void", locked: false, points: 0 });
    expect(jonah.lock).toEqual({ gameId: "g1", dropped: true });
    expect(jonah.correct).toBe(1);
    expect(jonah.incorrect).toBe(0);

    const alex = result.scores.find((s) => s.memberId === "alex")!;
    expect(alex.picks[0]).toEqual({ gameId: "g1", team: null, outcome: "void", locked: false, points: 0 });
  });

  it("reports games not yet final as pending, contributing nothing, and marks the week incomplete", () => {
    const live: Game = { id: "g1", homeTeam: "Georgia", awayTeam: "Clemson", homeScore: 14, awayScore: 3, status: "in_progress", void: false };
    const upcoming: Game = { id: "g2", homeTeam: "Ohio State", awayTeam: "Texas", homeScore: null, awayScore: null, status: "scheduled", void: false };
    const result = scoreWeek(
      rules,
      week({
        games: [live, upcoming, finalGame("g3", "Alabama", "LSU", 21, 28)],
        picks: [
          { memberId: "jonah", gameId: "g1", team: "Georgia" },
          { memberId: "jonah", gameId: "g2", team: "Texas" },
          { memberId: "jonah", gameId: "g3", team: "LSU" },
        ],
        locks: [{ memberId: "jonah", gameId: "g1" }],
      }),
      members,
    );

    expect(result.complete).toBe(false);
    const jonah = result.scores.find((s) => s.memberId === "jonah")!;
    expect(jonah.points).toBe(10);
    expect(jonah.pending).toBe(2);
    expect(jonah.picks[0]).toEqual({ gameId: "g1", team: "Georgia", outcome: "pending", locked: true, points: 0 });
    expect(jonah.picks[1]).toEqual({ gameId: "g2", team: "Texas", outcome: "pending", locked: false, points: 0 });
  });

  it("marks a week complete when every non-void game is final", () => {
    const voided: Game = { id: "g1", homeTeam: "Georgia", awayTeam: "Clemson", homeScore: null, awayScore: null, status: "scheduled", void: true };
    const result = scoreWeek(rules, week({ games: [voided, finalGame("g2", "Ohio State", "Texas", 14, 24)] }), members);
    expect(result.complete).toBe(true);
  });

  describe("Weekly Win", () => {
    const games = [finalGame("g1", "Georgia", "Clemson", 31, 17), finalGame("g2", "Ohio State", "Texas", 14, 24)];

    it("goes to the highest score and reports each member's tiebreaker error", () => {
      const result = scoreWeek(
        rules,
        week({
          games,
          tiebreakerGameId: "g2",
          picks: [
            { memberId: "jonah", gameId: "g1", team: "Georgia" },
            { memberId: "jonah", gameId: "g2", team: "Texas" },
            { memberId: "alex", gameId: "g1", team: "Georgia" },
            { memberId: "alex", gameId: "g2", team: "Ohio State" },
          ],
          tiebreakerGuesses: [
            { memberId: "jonah", guess: 45 },
            { memberId: "alex", guess: 37 },
          ],
        }),
        members,
      );

      expect(result.weeklyWin).toEqual({ winners: ["jonah"], points: 20, decidedBy: "points" });
      const jonah = result.scores.find((s) => s.memberId === "jonah")!;
      expect(jonah.tiebreakerGuess).toBe(45);
      expect(jonah.tiebreakerError).toBe(7);
      const alex = result.scores.find((s) => s.memberId === "alex")!;
      expect(alex.tiebreakerError).toBe(1);
      expect(result.scores.map((s) => s.memberId)).toEqual(["jonah", "alex"]);
    });

    const tiedPicks = [
      { memberId: "jonah", gameId: "g1", team: "Georgia" },
      { memberId: "jonah", gameId: "g2", team: "Ohio State" },
      { memberId: "alex", gameId: "g1", team: "Georgia" },
      { memberId: "alex", gameId: "g2", team: "Ohio State" },
    ];

    it("breaks a points tie by the smallest absolute Tiebreaker Guess error", () => {
      const result = scoreWeek(
        rules,
        week({
          games,
          tiebreakerGameId: "g2",
          picks: tiedPicks,
          tiebreakerGuesses: [
            { memberId: "jonah", guess: 45 },
            { memberId: "alex", guess: 37 },
          ],
        }),
        members,
      );

      expect(result.weeklyWin).toEqual({ winners: ["alex"], points: 10, decidedBy: "tiebreaker" });
      expect(result.scores.map((s) => s.memberId)).toEqual(["alex", "jonah"]);
    });

    it("treats a missing Tiebreaker Guess as a guess of 0", () => {
      const result = scoreWeek(
        rules,
        week({
          games,
          tiebreakerGameId: "g2",
          picks: tiedPicks,
          tiebreakerGuesses: [{ memberId: "jonah", guess: 70 }],
        }),
        members,
      );

      const alex = result.scores.find((s) => s.memberId === "alex")!;
      expect(alex.tiebreakerGuess).toBeNull();
      expect(alex.tiebreakerError).toBe(38);
      expect(result.weeklyWin).toEqual({ winners: ["jonah"], points: 10, decidedBy: "tiebreaker" });
    });

    it("is shared when scores and tiebreaker errors both tie", () => {
      const result = scoreWeek(
        rules,
        week({
          games,
          tiebreakerGameId: "g2",
          picks: tiedPicks,
          tiebreakerGuesses: [
            { memberId: "jonah", guess: 40 },
            { memberId: "alex", guess: 36 },
          ],
        }),
        members,
      );

      expect(result.weeklyWin).toEqual({ winners: ["jonah", "alex"], points: 10, decidedBy: "shared" });
    });

    it("is shared when the Tiebreaker Game has no final score yet", () => {
      const result = scoreWeek(
        rules,
        week({
          games,
          tiebreakerGameId: null,
          picks: tiedPicks,
        }),
        members,
      );

      expect(result.weeklyWin).toEqual({ winners: ["jonah", "alex"], points: 10, decidedBy: "shared" });
    });

    it("is null when nobody played the week", () => {
      expect(scoreWeek(rules, week({ games }), []).weeklyWin).toBeNull();
    });
  });

  it("leaves out members who joined after the Deadline", () => {
    const lateJoiner: Member = { id: "grandma", joinedAt: "2026-09-06T00:00:00Z" };
    const result = scoreWeek(
      rules,
      week({
        deadline: "2026-09-05T16:00:00Z",
        games: [finalGame("g1", "Georgia", "Clemson", 31, 17)],
        picks: [{ memberId: "jonah", gameId: "g1", team: "Georgia" }],
      }),
      [...members, lateJoiner],
    );

    expect(result.scores.map((s) => s.memberId)).toEqual(["jonah", "alex"]);
  });
});
