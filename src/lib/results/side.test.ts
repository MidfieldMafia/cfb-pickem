import { describe, expect, test } from "vitest";
import type { GameResult } from "./result";
import { sideStanding } from "./side";

const SCHEDULED: GameResult = {
  status: "pending",
  homeScore: null,
  awayScore: null,
  source: null,
  live: null,
  shown: null,
  label: "Scheduled",
  note: null,
  feedFinal: null,
};

const live = (awayScore: number, homeScore: number): GameResult => ({
  ...SCHEDULED,
  live: { awayScore, homeScore, period: 2, clock: "05:00" },
  shown: { awayScore, homeScore },
  label: "In progress",
});

const final = (awayScore: number, homeScore: number): GameResult => ({
  ...SCHEDULED,
  status: "final",
  awayScore,
  homeScore,
  source: "feed",
  shown: { awayScore, homeScore },
  label: "Final",
});

describe("where a side stands", () => {
  test("is won or lost once the game is final, and level for a tie", () => {
    expect(sideStanding(final(21, 34), "home")).toBe("won");
    expect(sideStanding(final(21, 34), "away")).toBe("lost");
    expect(sideStanding(final(17, 17), "home")).toBe("level");
  });

  test("is leading or trailing while the game is going, never won", () => {
    expect(sideStanding(live(10, 28), "home")).toBe("leading");
    expect(sideStanding(live(10, 28), "away")).toBe("trailing");
    expect(sideStanding(live(0, 0), "away")).toBe("level");
  });

  test("is nothing before kickoff and for a Void, whatever the feed scored", () => {
    expect(sideStanding(SCHEDULED, "home")).toBe("none");
    const voided: GameResult = { ...SCHEDULED, status: "void", label: "Void", note: "Lightning" };
    expect(sideStanding(voided, "home")).toBe("none");
  });

  test("reads the effective result, so an override decides it over the feed", () => {
    const overridden: GameResult = { ...final(21, 34), source: "override", label: "Final · override", note: "Feed wrong", feedFinal: { awayScore: 34, homeScore: 21 } };
    expect(sideStanding(overridden, "home")).toBe("won");
  });
});
