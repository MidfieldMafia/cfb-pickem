/**
 * Who a Week counts, and who it expected Picks from. These used to be one
 * function with an optional argument, and the argument quietly decided which
 * question was being asked: pass picks and you got the counting answer widened
 * for the deactivated, pass none and you got the chasing answer. Requiring a
 * Pick to have played a Week split them for good — the reminder table has to
 * see the members with no Picks, which is exactly who the board now leaves out.
 */
import { describe, expect, test } from "vitest";
import { expected, roster, type RosterMember } from "./roster";

const DEADLINE = new Date("2026-09-11T00:00:00Z");
const BEFORE = new Date("2026-09-08T18:00:00Z");
const AFTER = new Date("2026-09-12T18:00:00Z");

const member = (id: number, joinedAt: Date, active = true): RosterMember => ({ id, active, joinedAt });

const week = { deadline: DEADLINE };

/** The members holding at least one Pick on the Week. */
const picked = (...ids: number[]) => new Set(ids);

describe("who a Week counts", () => {
  test("a member who joined before the Deadline and picked is on it", () => {
    expect(roster([member(1, BEFORE)], week, picked(1)).map((m) => m.id)).toEqual([1]);
  });

  test("a member who picked nothing is off it: a week they made no Pick in is not one they played", () => {
    expect(roster([member(1, BEFORE), member(2, BEFORE)], week, picked(1)).map((m) => m.id)).toEqual([1]);
  });

  test("a member who joined after the Deadline is off it, Picks or none", () => {
    // A commissioner can enter picks for anyone, so this pair really can exist.
    expect(roster([member(1, BEFORE), member(2, AFTER)], week, picked(1, 2)).map((m) => m.id)).toEqual([1]);
  });

  test("joining exactly at the Deadline is too late, the same instant picks lock", () => {
    expect(roster([member(1, DEADLINE)], week, picked(1))).toEqual([]);
  });

  test("a deactivated member who picked stays on: their points already happened", () => {
    const board = roster([member(1, BEFORE), member(2, BEFORE, false)], week, picked(1, 2));
    expect(board.map((m) => m.id)).toEqual([1, 2]);
  });

  test("a deactivated member who never picked is off it, on the same rule as anyone else who sat out", () => {
    expect(roster([member(1, BEFORE), member(2, BEFORE, false)], week, picked(1)).map((m) => m.id)).toEqual([1]);
  });

  test("a Week with no Deadline is not published, so nobody is on its board", () => {
    expect(roster([member(1, BEFORE)], { deadline: null }, picked(1))).toEqual([]);
  });

  test("the order handed in is the order handed back, so a caller's sort survives", () => {
    const board = roster([member(3, BEFORE), member(1, BEFORE), member(2, BEFORE)], week, picked(1, 2, 3));
    expect(board.map((m) => m.id)).toEqual([3, 1, 2]);
  });
});

describe("who a Week expected Picks from", () => {
  test("an active member who joined before the Deadline is chased, whether or not they have picked", () => {
    expect(expected([member(1, BEFORE), member(2, BEFORE)], week).map((m) => m.id)).toEqual([1, 2]);
  });

  test("a member who joined after the Deadline is not chased: the week was never theirs to finish", () => {
    expect(expected([member(1, BEFORE), member(2, AFTER)], week).map((m) => m.id)).toEqual([1]);
  });

  test("a deactivated member is not chased: there is nobody left to remind", () => {
    expect(expected([member(1, BEFORE), member(2, BEFORE, false)], week).map((m) => m.id)).toEqual([1]);
  });

  test("a Week with no Deadline has nobody to chase yet", () => {
    expect(expected([member(1, BEFORE)], { deadline: null })).toEqual([]);
  });

  test("the order handed in is the order handed back", () => {
    expect(expected([member(3, BEFORE), member(1, BEFORE)], week).map((m) => m.id)).toEqual([3, 1]);
  });
});
