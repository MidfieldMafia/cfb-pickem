import { describe, expect, it } from "vitest";
import { members, week1 } from "./fixtures/week-1-2026";
import { finalGame, rules2026, week } from "./fixtures/build";
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

/**
 * A second week on top of the recorded Week 1, so the Played Week rule can be
 * read against standings that are already hand-verified above.
 *
 * Alabama 21, LSU 28: LSU take it, and the Tiebreaker Game's combined score is
 * 49. Jonah picks it and guesses exactly; Grandma sends a Guess and no Picks;
 * everyone else does nothing at all.
 */
const week2 = week({
  weekNumber: 2,
  deadline: "2026-09-12T16:00:00Z",
  tiebreakerGameId: "w2g1",
  games: [finalGame("w2g1", "Alabama", "LSU", 21, 28)],
  picks: [{ memberId: "jonah", gameId: "w2g1", team: "LSU" }],
  tiebreakerGuesses: [
    { memberId: "jonah", guess: 49 },
    { memberId: "grandma", guess: 45 },
  ],
});

describe("Week 2 on the Week 1 fixture: a week with no Picks is not a Played Week", () => {
  const { leaderboard } = scoreSeason(rules2026, [week1, week2], members);
  const row = (id: string) => leaderboard.find((r) => r.memberId === id)!;

  it("counts a week in which a member made a single Pick", () => {
    // 80 then 10 over two weeks; errors 3 then 0.
    expect(row("jonah")).toMatchObject({
      totalPoints: 90,
      weeksPlayed: 2,
      averagePoints: 45,
      cumulativeTiebreakerError: 3,
      averageTiebreakerMiss: 1.5,
    });
  });

  it("leaves a Guess-only week off the member entirely: weeks played, average and miss are Week 1's", () => {
    // Grandma's Week 2 Guess of 45 buys nothing — not a played week, not a
    // point of the average, and not a term in the closeness sum.
    expect(row("grandma")).toMatchObject({
      totalPoints: 80,
      weeksPlayed: 1,
      averagePoints: 80,
      cumulativeTiebreakerError: 4,
      averageTiebreakerMiss: 4,
    });
  });

  it("leaves the members who did nothing in Week 2 exactly as Week 1 left them", () => {
    expect(
      ["alex", "cousin-em", "uncle-rick"].map((id) => {
        const r = row(id);
        return [r.memberId, r.totalPoints, r.weeksPlayed, r.averagePoints, r.cumulativeTiebreakerError];
      }),
    ).toEqual([
      ["alex", 60, 1, 60, 13],
      ["cousin-em", 30, 1, 30, 0],
      ["uncle-rick", 0, 1, 0, 73],
    ]);
  });

  it("gives Week 2 to the only member who played it", () => {
    const [, second] = scoreSeason(rules2026, [week1, week2], members).weeks;
    expect(second.scores.map((s) => s.memberId)).toEqual(["jonah"]);
    expect(second.weeklyWin).toEqual({ winners: ["jonah"], points: 10, decidedBy: "points" });
  });
});
