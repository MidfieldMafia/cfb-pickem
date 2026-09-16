import { describe, expect, it } from "vitest";
import { scoreWeek } from "./index";
import { finalGame, rules2026, week } from "./fixtures/build";
import type { Game, Member } from "./types";

const members: Member[] = [
  { id: "jonah", joinedAt: "2026-08-01T00:00:00Z" },
  { id: "alex", joinedAt: "2026-08-01T00:00:00Z" },
];

describe("scoreWeek", () => {
  it("awards 10 points per correct pick and 0 for an incorrect pick", () => {
    const result = scoreWeek(
      rules2026,
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
      rules2026,
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
      rules2026,
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
      rules2026,
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
      rules2026,
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
    const result = scoreWeek(rules2026, week({ games: [voided, finalGame("g2", "Ohio State", "Texas", 14, 24)] }), members);
    expect(result.complete).toBe(true);
  });

  describe("Weekly Win", () => {
    const games = [finalGame("g1", "Georgia", "Clemson", 31, 17), finalGame("g2", "Ohio State", "Texas", 14, 24)];

    it("goes to the highest score and reports each member's tiebreaker error", () => {
      const result = scoreWeek(
        rules2026,
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
        rules2026,
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
        rules2026,
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
        rules2026,
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
        rules2026,
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
      expect(scoreWeek(rules2026, week({ games }), []).weeklyWin).toBeNull();
    });
  });

  it("leaves out members who joined after the Deadline", () => {
    const lateJoiner: Member = { id: "grandma", joinedAt: "2026-09-06T00:00:00Z" };
    const result = scoreWeek(
      rules2026,
      week({
        deadline: "2026-09-05T16:00:00Z",
        games: [finalGame("g1", "Georgia", "Clemson", 31, 17), finalGame("g2", "Ohio State", "Texas", 14, 24)],
        picks: [
          { memberId: "jonah", gameId: "g1", team: "Georgia" },
          // Alex needs a Pick to be on the board at all now, and a wrong one
          // keeps the two of them off a points tie this test does not care about.
          { memberId: "alex", gameId: "g2", team: "Ohio State" },
        ],
      }),
      [...members, lateJoiner],
    );

    expect(result.scores.map((s) => s.memberId)).toEqual(["jonah", "alex"]);
  });

  it("leaves out a member who was out of the group when the Deadline fell", () => {
    // Removed on 1 September and not brought back until the 10th, so the Week 1
    // Deadline on the 5th fell while they were out of the group.
    const removed: Member = {
      id: "grandma",
      joinedAt: "2026-08-01T00:00:00Z",
      absences: [{ from: "2026-09-01T00:00:00Z", to: "2026-09-10T00:00:00Z" }],
    };
    const result = scoreWeek(
      rules2026,
      week({
        deadline: "2026-09-05T16:00:00Z",
        games: [finalGame("g1", "Georgia", "Clemson", 31, 17), finalGame("g2", "Ohio State", "Texas", 14, 24)],
        picks: [
          { memberId: "jonah", gameId: "g1", team: "Georgia" },
          { memberId: "alex", gameId: "g2", team: "Ohio State" },
          // Their Pick is still on the row — Picks belong to the person, not the
          // group. Being out of the group at the Deadline is what takes the week.
          { memberId: "grandma", gameId: "g1", team: "Georgia" },
        ],
      }),
      [...members, removed],
    );

    expect(result.scores.map((s) => s.memberId)).toEqual(["jonah", "alex"]);
  });

  /**
   * The second half of a Played Week: joining in time is not enough, the member
   * has to have picked.
   *
   * A member who sat the week out keeps their row, at zero, so the week's own
   * screens can show that they did not pick rather than making them disappear.
   * What marks the week as not theirs is `played`, which `scoreSeason` filters
   * on and `decideWeeklyWin` never sees.
   */
  describe("a week with no Picks is not a Played Week", () => {
    it("keeps a member who made no Pick on the board at zero, with the week not counted", () => {
      const result = scoreWeek(
        rules2026,
        week({
          games: [finalGame("g1", "Georgia", "Clemson", 31, 17)],
          picks: [{ memberId: "jonah", gameId: "g1", team: "Georgia" }],
        }),
        members,
      );

      expect(result.scores.map((s) => [s.memberId, s.played, s.points, s.correct, s.incorrect])).toEqual([
        ["jonah", true, 10, 1, 0],
        // On the board, 0-0, nothing scored, and the week is not one they played.
        ["alex", false, 0, 0, 0],
      ]);
    });

    it("counts the week on a single Pick, right or wrong", () => {
      const result = scoreWeek(
        rules2026,
        week({
          games: [finalGame("g1", "Georgia", "Clemson", 31, 17), finalGame("g2", "Ohio State", "Texas", 14, 24)],
          picks: [
            { memberId: "jonah", gameId: "g1", team: "Georgia" },
            // Wrong, and the only one they made: still a week they turned up for.
            { memberId: "alex", gameId: "g2", team: "Ohio State" },
          ],
        }),
        members,
      );

      expect(result.scores.map((s) => [s.memberId, s.played, s.points])).toEqual([
        ["jonah", true, 10],
        ["alex", true, 0],
      ]);
    });

    it("sorts a member who sat out below one who picked and scored nothing", () => {
      const result = scoreWeek(
        rules2026,
        week({
          games: [finalGame("g1", "Georgia", "Clemson", 31, 17)],
          // Wrong, so Alex scores nothing either. Both rows read zero; only one
          // of them turned up, and that is the one that sorts higher.
          picks: [{ memberId: "alex", gameId: "g1", team: "Clemson" }],
        }),
        members,
      );

      expect(result.scores.map((s) => [s.memberId, s.played, s.points])).toEqual([
        ["alex", true, 0],
        ["jonah", false, 0],
      ]);
    });

    it("does not count a week on a Tiebreaker Guess alone, though the Guess still shows", () => {
      const result = scoreWeek(
        rules2026,
        week({
          games: [finalGame("g1", "Georgia", "Clemson", 31, 17)],
          tiebreakerGameId: "g1",
          picks: [{ memberId: "jonah", gameId: "g1", team: "Georgia" }],
          tiebreakerGuesses: [{ memberId: "alex", guess: 48 }],
        }),
        members,
      );

      const alex = result.scores.find((s) => s.memberId === "alex")!;
      expect(alex.played).toBe(false);
      // The Guess is theirs and is shown; it just buys them no week.
      expect(alex.tiebreakerGuess).toBe(48);
    });

    it("counts a Pick on a Void game: the Void is the commissioner's doing, not a week the member sat out", () => {
      const voided: Game = { ...finalGame("g1", "Georgia", "Clemson", 31, 17), void: true };
      const result = scoreWeek(
        rules2026,
        week({
          games: [voided, finalGame("g2", "Ohio State", "Texas", 14, 24)],
          picks: [
            { memberId: "jonah", gameId: "g2", team: "Texas" },
            { memberId: "alex", gameId: "g1", team: "Georgia" },
          ],
        }),
        members,
      );

      expect(result.scores.map((s) => [s.memberId, s.played, s.points])).toEqual([
        ["jonah", true, 10],
        ["alex", true, 0],
      ]);
    });

    it("keeps a member who sat out from sharing a Weekly Win nobody scored in", () => {
      const result = scoreWeek(
        rules2026,
        week({
          games: [finalGame("g1", "Georgia", "Clemson", 31, 17)],
          picks: [{ memberId: "alex", gameId: "g1", team: "Clemson" }],
        }),
        members,
      );

      // Alex scored nothing, but Alex is the only one in the running: a member
      // who never picked cannot tie their way into a share of the week.
      expect(result.weeklyWin).toEqual({ winners: ["alex"], points: 0, decidedBy: "points" });
    });

    it("has no Weekly Win in a week nobody picked, though everyone is still on the board", () => {
      const result = scoreWeek(rules2026, week({ games: [finalGame("g1", "Georgia", "Clemson", 31, 17)] }), members);

      // Both sit on zero and neither played, so nothing separates them and the
      // order between them is not something this test should depend on.
      expect(result.scores.map((s) => s.memberId).sort()).toEqual(["alex", "jonah"]);
      expect(result.scores.every((s) => !s.played)).toBe(true);
      expect(result.weeklyWin).toBeNull();
    });
  });
});
