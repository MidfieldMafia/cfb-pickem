import { describe, expect, test } from "vitest";
import type { GameResult } from "./result";
import type { RevealPick } from "./results";
import { pennantRow, sideStanding } from "./side";

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

/** One member's pick on a side; only the member id matters to the row. */
const pick = (memberId: number): RevealPick => ({ memberId, teamId: 1, outcome: "pending", lock: null });

/** `n` members took this side, ids 1..n in board order. */
const took = (n: number): RevealPick[] => Array.from({ length: n }, (_, i) => pick(i + 1));

describe("the pennant row a side shows", () => {
  test("shows everyone and counts nobody while they fit", () => {
    expect(pennantRow(took(5), 1)).toEqual({ shown: took(5), hidden: 0 });
    expect(pennantRow(took(1), 1).hidden).toBe(0);
    // Nobody took this side: an empty row, not a "+0".
    expect(pennantRow([], 1)).toEqual({ shown: [], hidden: 0 });
  });

  test("spends its last slot on a count once more took the side than it holds", () => {
    // Twelve members on one side is the whole family on the favourite, which
    // is the case the row has to survive at 390px.
    const row = pennantRow(took(12), 1);
    expect(row.shown).toHaveLength(4);
    expect(row.hidden).toBe(8);
    // Four pennants plus one chip is five slots: what the row is measured for.
    expect(row.shown.length + 1).toBe(5);
  });

  test("keeps the viewer on the row, taking the last pennant when the cap would hide them", () => {
    // Member 12 picked last, so the cap would have folded them into the count.
    const row = pennantRow(took(12), 12);
    expect(row.shown.map((p) => p.memberId)).toEqual([1, 2, 3, 12]);
    // Still four shown, so the count is the same however far down the viewer sat.
    expect(row.hidden).toBe(8);
  });

  test("does not move a viewer the row was already showing", () => {
    expect(pennantRow(took(12), 2).shown.map((p) => p.memberId)).toEqual([1, 2, 3, 4]);
  });

  test("counts everyone hidden when the viewer did not take this side at all", () => {
    // The viewer picked the other team, so there is no pennant of theirs to keep.
    const row = pennantRow(took(9), 99);
    expect(row.shown.map((p) => p.memberId)).toEqual([1, 2, 3, 4]);
    expect(row.hidden).toBe(5);
  });
});
