import { describe, expect, it } from "vitest";
import { members, rules2026, week1 } from "./fixtures/week-1-2026";
import { scoreSeason, scoreWeek } from "./index";

/**
 * Expected standings worked by hand from the fixture:
 *
 * Tiebreaker Game g6 combined score is 73.
 *
 * | member     | correct | wrong | lock            | points | guess | error |
 * |------------|---------|-------|-----------------|--------|-------|-------|
 * | jonah      | 7       | 2     | g3 hit (+10)    | 80     | 70    | 3     |
 * | grandma    | 7       | 2     | g2 hit (+10)    | 80     | 77    | 4     |
 * | alex       | 6       | 3     | g10 dropped     | 60     | 60    | 13    |
 * | cousin-em  | 3       | 0     | none            | 30     | 73    | 0     |
 * | uncle-rick | 0       | 9     | g1 missed       | 0      | none  | 73    |
 *
 * Jonah and Grandma tie on 80; Jonah is closer on the tiebreaker and takes the Weekly Win.
 */
describe("Week 1 of 2026 fixture", () => {
  const result = scoreWeek(rules2026, week1, members);
  const score = (id: string) => result.scores.find((s) => s.memberId === id)!;

  it("is a complete week with the Void game excused", () => {
    expect(result.complete).toBe(true);
  });

  it("produces the hand-verified weekly standings", () => {
    expect(result.scores.map((s) => [s.memberId, s.points, s.correct, s.incorrect, s.tiebreakerError])).toEqual([
      ["jonah", 80, 7, 2, 3],
      ["grandma", 80, 7, 2, 4],
      ["alex", 60, 6, 3, 13],
      ["cousin-em", 30, 3, 0, 0],
      ["uncle-rick", 0, 0, 9, 73],
    ]);
  });

  it("gives Jonah the Weekly Win on the tiebreaker", () => {
    expect(result.weeklyWin).toEqual({ winners: ["jonah"], points: 80, decidedBy: "tiebreaker" });
  });

  it("reports Locks: hit, missed, and dropped by the Void", () => {
    expect(score("jonah").lock).toEqual({ gameId: "g3", dropped: false });
    expect(score("jonah").picks.find((p) => p.gameId === "g3")).toMatchObject({ locked: true, points: 20 });
    expect(score("uncle-rick").picks.find((p) => p.gameId === "g1")).toMatchObject({ locked: true, points: 0 });
    expect(score("alex").lock).toEqual({ gameId: "g10", dropped: true });
    expect(score("alex").picks.find((p) => p.gameId === "g10")).toMatchObject({ outcome: "void", locked: false, points: 0 });
  });

  it("reports unpicked games for the member who stopped after three", () => {
    const outcomes = score("cousin-em").picks.map((p) => p.outcome);
    expect(outcomes).toEqual([
      "correct", "correct", "correct",
      "unpicked", "unpicked", "unpicked", "unpicked", "unpicked", "unpicked",
      "void",
    ]);
  });

  it("produces the hand-verified season Leaderboard after one week", () => {
    const { leaderboard } = scoreSeason(rules2026, [week1], members);
    expect(
      leaderboard.map((r) => [r.memberId, r.rank, r.totalPoints, r.weeklyWins, r.weeksPlayed, r.averagePoints, r.cumulativeTiebreakerError]),
    ).toEqual([
      ["jonah", 1, 80, 1, 1, 80, 3],
      ["grandma", 2, 80, 0, 1, 80, 4],
      ["alex", 3, 60, 0, 1, 60, 13],
      ["cousin-em", 4, 30, 0, 1, 30, 0],
      ["uncle-rick", 5, 0, 0, 1, 0, 73],
    ]);
  });
});
