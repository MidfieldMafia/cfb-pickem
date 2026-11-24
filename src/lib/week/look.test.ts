import { describe, expect, it } from "vitest";
import { AFTER_KICKOFF, BEFORE_KICKOFF, gameRow } from "@/test/game";
import { weekLook } from "./look";

/** A published Week of `year`'s season, its one Game Oklahoma at Michigan, scheduled. */
function slate(year: number, weekNumber: number, games = [gameRow()]) {
  return { season: { year }, week: { weekNumber, published: true }, games };
}

describe("weekLook", () => {
  it("wears the Rivalry Week Look for 2026 Week 13", () => {
    expect(weekLook(slate(2026, 13), BEFORE_KICKOFF)).toBe("rivalry");
  });

  it("stays on while a Game of Week 13 is under way", () => {
    const live = gameRow({ status: "in_progress", homeScore: 7, awayScore: 3, period: 2 });
    expect(weekLook(slate(2026, 13, [live]), AFTER_KICKOFF)).toBe("rivalry");
  });

  it("is off for Week 12", () => {
    expect(weekLook(slate(2026, 12), BEFORE_KICKOFF)).toBeNull();
  });

  it("is off for Week 13 of another season", () => {
    expect(weekLook(slate(2027, 13), BEFORE_KICKOFF)).toBeNull();
    expect(weekLook(slate(2025, 13), BEFORE_KICKOFF)).toBeNull();
  });

  it("is off once Week 13 is settled", () => {
    const final = gameRow({ status: "final", homeScore: 24, awayScore: 17 });
    expect(weekLook(slate(2026, 13, [final]), AFTER_KICKOFF)).toBeNull();
  });

  it("is off once every Game is final or Void", () => {
    const final = gameRow({ status: "final", homeScore: 24, awayScore: 17 });
    const voided = gameRow({ id: 8, void: true, voidNote: "Postponed" });
    expect(weekLook(slate(2026, 13, [final, voided]), AFTER_KICKOFF)).toBeNull();
  });

  it("is off for a Week 13 that is not published", () => {
    const draft = { ...slate(2026, 13), week: { weekNumber: 13, published: false } };
    expect(weekLook(draft, BEFORE_KICKOFF)).toBeNull();
  });

  it("is off when there is no published Week", () => {
    expect(weekLook(null, BEFORE_KICKOFF)).toBeNull();
  });
});
