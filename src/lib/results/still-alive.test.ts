import { describe, expect, test } from "vitest";
import type { Game } from "@/db/schema";
import { beforeWeekKickoff, stillAlive, type AliveRow, type AliveScore } from "./still-alive";

/** A member on the board: `points` is the season so far, `active` false once they have left. */
function row(id: number, points: number, active = true): AliveRow {
  return { member: { id }, totalPoints: points, active };
}

/** The member's Week 13 Weekly Score before any kickoff: nothing earned, `max` still to come. */
function score(id: number, max: number): AliveScore {
  return { member: { id }, points: 0, maxPoints: max };
}

describe("stillAlive", () => {
  test("marks every member whose points plus Week 13's max reach the leader", () => {
    const rows = [row(1, 300), row(2, 250), row(3, 180), row(4, 100), row(5, 90)];
    const week = [score(1, 110), score(2, 110), score(3, 110), score(4, 110), score(5, 110)];
    // 180 + 110 = 290 falls short of 300, so only the top two can still finish first.
    expect(stillAlive(rows, week)).toEqual({ alive: [1, 2], clinched: false });
  });

  test("a member tied with the leader on points is alive, and so is one who can only just draw level", () => {
    const rows = [row(1, 300), row(2, 300), row(3, 190), row(4, 100), row(5, 100), row(6, 100)];
    const week = rows.map((r) => score(r.member.id, 110));
    expect(stillAlive(rows, week)).toEqual({ alive: [1, 2, 3], clinched: false });
  });

  test("a sole survivor has clinched", () => {
    const rows = [row(1, 400), row(2, 250), row(3, 200)];
    const week = rows.map((r) => score(r.member.id, 110));
    expect(stillAlive(rows, week)).toEqual({ alive: [1], clinched: true });
  });

  test("a member's own max counts, not a slate-wide figure", () => {
    const rows = [row(1, 300), row(2, 250), row(3, 250), row(4, 100)];
    // Member 3 skipped games, so their ceiling is 40 and 250 + 40 falls short.
    const week = [score(1, 110), score(2, 110), score(3, 40), score(4, 110)];
    expect(stillAlive(rows, week)).toEqual({ alive: [1, 2], clinched: false });
  });

  test("a member with no Week 13 score has nothing to come", () => {
    const rows = [row(1, 300), row(2, 295), row(3, 100), row(4, 100), row(5, 100)];
    expect(stillAlive(rows, [score(1, 110)])).toEqual({ alive: [1], clinched: true });
  });

  test("only the max still to come counts: points already in the season are not added twice", () => {
    const rows = [row(1, 300), row(2, 250), row(3, 100), row(4, 100)];
    const week = [
      { member: { id: 1 }, points: 0, maxPoints: 110 },
      { member: { id: 2 }, points: 10, maxPoints: 40 },
      { member: { id: 3 }, points: 0, maxPoints: 110 },
      { member: { id: 4 }, points: 0, maxPoints: 110 },
    ];
    // Member 2's 250 already includes their 10: 250 + (40 - 10) = 280, short of 300.
    expect(stillAlive(rows, week)).toEqual({ alive: [1], clinched: true });
  });

  test("hides the mark when more than half the group is alive", () => {
    const rows = [row(1, 300), row(2, 290), row(3, 280), row(4, 100)];
    const week = rows.map((r) => score(r.member.id, 110));
    expect(stillAlive(rows, week)).toBeNull();
  });

  test("exactly half alive still shows", () => {
    const rows = [row(1, 300), row(2, 290), row(3, 100), row(4, 100)];
    const week = rows.map((r) => score(r.member.id, 110));
    expect(stillAlive(rows, week)).toEqual({ alive: [1, 2], clinched: false });
  });

  test("a member who has left is never marked, never the leader to catch, and not counted in the group", () => {
    // 1 has left while leading: the title is the best of the rest.
    const rows = [row(1, 500, false), row(2, 300), row(3, 100), row(4, 100), row(5, 100)];
    const week = rows.map((r) => score(r.member.id, 110));
    expect(stillAlive(rows, week)).toEqual({ alive: [2], clinched: true });
    // Without 1 the group is four, and two of them alive is exactly half.
    const two = [row(1, 500, false), row(2, 300), row(3, 200), row(4, 100), row(5, 100)];
    expect(stillAlive(two, two.map((r) => score(r.member.id, 110)))).toEqual({ alive: [2, 3], clinched: false });
  });

  test("a group with nobody in it has no mark", () => {
    expect(stillAlive([], [])).toBeNull();
    expect(stillAlive([row(1, 10, false)], [score(1, 110)])).toBeNull();
  });
});

describe("beforeWeekKickoff", () => {
  const now = new Date("2026-11-27T15:00:00Z");
  const game = (kickoff: string, over: Partial<Game> = {}) =>
    ({
      kickoff: new Date(kickoff),
      void: false,
      status: "scheduled",
      homeScore: null,
      awayScore: null,
      overrideHomeScore: null,
      overrideAwayScore: null,
      liveFeed: null,
      ...over,
    }) as Game;
  const slate = (weekNumber: number, games: Game[]) => ({ week: { weekNumber }, games });

  test("is true on Week 13 while every game is yet to kick off", () => {
    expect(beforeWeekKickoff(slate(13, [game("2026-11-27T17:00:00Z"), game("2026-11-28T17:00:00Z")]), now)).toBe(true);
  });

  test("is false once any game has kicked off", () => {
    expect(beforeWeekKickoff(slate(13, [game("2026-11-27T14:59:00Z"), game("2026-11-28T17:00:00Z")]), now)).toBe(false);
  });

  test("is false in any other Week, and with no published Slate", () => {
    expect(beforeWeekKickoff(slate(12, [game("2026-11-27T17:00:00Z")]), now)).toBe(false);
    expect(beforeWeekKickoff(null, now)).toBe(false);
  });

  test("ignores a Void game, and is false when a game is under way ahead of its kickoff time", () => {
    expect(beforeWeekKickoff(slate(13, [game("2026-11-27T14:00:00Z", { void: true }), game("2026-11-27T17:00:00Z")]), now)).toBe(true);
    const underWay = game("2026-11-27T17:00:00Z", { status: "in_progress", homeScore: 0, awayScore: 0 });
    expect(beforeWeekKickoff(slate(13, [underWay]), now)).toBe(false);
  });

  test("is false for a Slate with no games", () => {
    expect(beforeWeekKickoff(slate(13, []), now)).toBe(false);
  });
});
