/**
 * How Review stacks a slate: one heading per kickoff, and the Eastern-time
 * window convention the headings are named after. Both are pure string work,
 * and both are wrong in ways nobody would notice on a screenshot — a viewer in
 * Los Angeles seeing a 9am kickoff filed under "Noon" is the point of the
 * timezone argument, not a bug.
 */
import { describe, expect, test } from "vitest";
import { groupByKickoff, windowLabel } from "./kickoff-groups";

/** The games in a group, by the ids given here, so the assertions read as order. */
const game = (id: number, kickoff: string) => ({ id, kickoff });

describe("windowLabel", () => {
  test("names the three windows college football uses, in Eastern time", () => {
    // Noon ET, 3:30 ET, 8:00 ET — the slots the design was drawn around.
    expect(windowLabel("2026-09-12T16:00:00Z")).toBe("Noon");
    expect(windowLabel("2026-09-12T19:30:00Z")).toBe("Afternoon");
    expect(windowLabel("2026-09-13T00:00:00Z")).toBe("Night");
  });

  test("bucketing is Eastern regardless of the viewer, so the boundaries land on ET hours", () => {
    // 13:59 ET is still a noon game; 14:00 ET is the afternoon window.
    expect(windowLabel("2026-09-12T17:59:00Z")).toBe("Noon");
    expect(windowLabel("2026-09-12T18:00:00Z")).toBe("Afternoon");
    // 17:59 ET is still afternoon; 18:00 ET is a night game.
    expect(windowLabel("2026-09-12T21:59:00Z")).toBe("Afternoon");
    expect(windowLabel("2026-09-12T22:00:00Z")).toBe("Night");
  });

  test("an early kickoff files under Noon rather than falling out of the windows", () => {
    // 7am ET; rare, but Week 0 in Ireland kicks off before breakfast.
    expect(windowLabel("2026-09-12T11:00:00Z")).toBe("Noon");
  });

  test("takes a Date as readily as the ISO string a screen holds", () => {
    expect(windowLabel(new Date("2026-09-13T00:00:00Z"))).toBe("Night");
  });
});

describe("groupByKickoff", () => {
  test("groups games that kick off together, earliest group first", () => {
    const groups = groupByKickoff([
      game(3, "2026-09-12T23:30:00.000Z"),
      game(1, "2026-09-12T16:00:00.000Z"),
      game(2, "2026-09-12T16:00:00.000Z"),
    ]);

    expect(groups).toEqual([
      { kickoff: "2026-09-12T16:00:00.000Z", games: [game(1, "2026-09-12T16:00:00.000Z"), game(2, "2026-09-12T16:00:00.000Z")] },
      { kickoff: "2026-09-12T23:30:00.000Z", games: [game(3, "2026-09-12T23:30:00.000Z")] },
    ]);
  });

  test("keeps slate order inside a group, so the Review order matches the pick flow", () => {
    const at = "2026-09-12T16:00:00.000Z";

    const [group] = groupByKickoff([game(7, at), game(2, at), game(5, at)]);

    expect(group.games.map((g) => g.id)).toEqual([7, 2, 5]);
  });

  test("kickoffs a minute apart are separate groups, not one window", () => {
    const groups = groupByKickoff([game(1, "2026-09-12T16:00:00.000Z"), game(2, "2026-09-12T16:01:00.000Z")]);

    expect(groups.map((g) => g.kickoff)).toEqual(["2026-09-12T16:00:00.000Z", "2026-09-12T16:01:00.000Z"]);
  });

  test("sorts across a day boundary, which string order gets right for ISO", () => {
    const groups = groupByKickoff([game(1, "2026-09-13T00:00:00.000Z"), game(2, "2026-09-12T23:30:00.000Z")]);

    expect(groups.map((g) => g.games[0].id)).toEqual([2, 1]);
  });

  test("an empty slate is no groups", () => {
    expect(groupByKickoff([])).toEqual([]);
  });
});
