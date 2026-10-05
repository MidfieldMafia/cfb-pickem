import { describe, expect, test } from "vitest";
import type { GameView } from "@/lib/slate/json";
import { lockOn, NO_LOCK, sheetProgress, type LockState } from "./progress";
import { pageAfter, walkAfterSave } from "./walk";

function view(id: number, voided = false): GameView {
  return {
    game: { id } as GameView["game"],
    result: { status: voided ? "void" : "pending" } as GameView["result"],
  };
}

/** Three games with the middle one Void. */
const SLATE = [view(1), view(2, true), view(3)];

/** The sheet as it stood when the tap landed: picks on `pickedIds`, and the Lock and Guess as given. */
function before(pickedIds: number[], { lock = NO_LOCK, guess = null }: { lock?: LockState; guess?: number | null } = {}) {
  return sheetProgress({
    games: SLATE,
    picked: (gameId) => pickedIds.includes(gameId),
    lock,
    tiebreakerGuess: guess,
  });
}

describe("the walk after a pick saves", () => {
  test("saving the last open game with neither set walks through the Lock, then the Guess", () => {
    expect(walkAfterSave(before([1]), true)).toEqual(["lock", "guess"]);
  });

  test("it covers only what is still missing", () => {
    expect(walkAfterSave(before([1], { guess: 52 }), true)).toEqual(["lock"]);
    expect(walkAfterSave(before([1], { lock: lockOn(SLATE, 1) }), true)).toEqual(["guess"]);
    expect(walkAfterSave(before([1], { lock: lockOn(SLATE, 1), guess: 52 }), true)).toEqual([]);
  });

  test("a Dropped Lock is a Lock still to set", () => {
    expect(walkAfterSave(before([1], { lock: lockOn(SLATE, 2), guess: 52 }), true)).toEqual(["lock"]);
  });

  test("a save that leaves games open never starts it", () => {
    expect(walkAfterSave(before([]), true)).toEqual([]);
  });

  test("changing a pick on a full sheet never starts it", () => {
    expect(walkAfterSave(before([1, 3]), false)).toEqual([]);
  });

  test("the Void game does not hold it back", () => {
    // Game 2 is Void, so game 3 is the last one open whichever order they were picked in.
    expect(walkAfterSave(before([3]), true)).toEqual(["lock", "guess"]);
  });
});

describe("where a walk page goes next", () => {
  test("the Lock leads to the Guess when both are owed, and the Guess to Review", () => {
    expect(pageAfter(["lock", "guess"], "lock")).toBe("guess");
    expect(pageAfter(["lock", "guess"], "guess")).toBe("review");
  });

  test("a page on its own goes back to Review", () => {
    expect(pageAfter(["lock"], "lock")).toBe("review");
    expect(pageAfter(["guess"], "guess")).toBe("review");
  });
});
