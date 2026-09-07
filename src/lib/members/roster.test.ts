/**
 * Who a Week counts. The rule used to be spelled three ways — the Reveal's
 * `active = true`, the console's SQL with the Deadline in it, and the engine's
 * `playedWeek` — so a member who joined mid-week was on one screen, off
 * another, and out of the scoring. These are the two rules, stated once.
 */
import { describe, expect, test } from "vitest";
import { roster, type RosterMember } from "./roster";

const DEADLINE = new Date("2026-09-11T00:00:00Z");
const BEFORE = new Date("2026-09-08T18:00:00Z");
const AFTER = new Date("2026-09-12T18:00:00Z");

const member = (id: number, joinedAt: Date, active = true): RosterMember => ({ id, active, joinedAt });

const week = { deadline: DEADLINE };

describe("who is on a Week's board", () => {
  test("an active member who joined before the Deadline is on it", () => {
    expect(roster([member(1, BEFORE)], week).map((m) => m.id)).toEqual([1]);
  });

  test("a member who joined after the Deadline is off it: the week was never theirs to play", () => {
    expect(roster([member(1, BEFORE), member(2, AFTER)], week).map((m) => m.id)).toEqual([1]);
  });

  test("joining exactly at the Deadline is too late, the same instant picks lock", () => {
    expect(roster([member(1, DEADLINE)], week)).toEqual([]);
  });

  test("a deactivated member is off the board when nobody is counting their picks", () => {
    expect(roster([member(1, BEFORE), member(2, BEFORE, false)], week).map((m) => m.id)).toEqual([1]);
  });

  test("a deactivated member with Picks stays on: their points already happened", () => {
    const board = roster([member(1, BEFORE), member(2, BEFORE, false)], week, new Set([2]));
    expect(board.map((m) => m.id)).toEqual([1, 2]);
  });

  test("Picks do not buy a way past the Deadline", () => {
    // A commissioner can enter picks for anyone, so this pair really can exist.
    expect(roster([member(2, AFTER, false)], week, new Set([2]))).toEqual([]);
    expect(roster([member(2, AFTER)], week, new Set([2]))).toEqual([]);
  });

  test("a Week with no Deadline is not published, so nobody is on its board", () => {
    expect(roster([member(1, BEFORE)], { deadline: null })).toEqual([]);
  });

  test("the order handed in is the order handed back, so a caller's sort survives", () => {
    const board = roster([member(3, BEFORE), member(1, BEFORE), member(2, BEFORE)], week);
    expect(board.map((m) => m.id)).toEqual([3, 1, 2]);
  });
});
