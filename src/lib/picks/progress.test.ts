import { describe, expect, test } from "vitest";
import { firstOpenGame, liveGames, remainingLabel, sheetProgress, type SheetProgress } from "./progress";

/** Three games with the middle one Void: the shape every screen counts over. */
const SLATE = [
  { id: 1, void: false },
  { id: 2, void: true },
  { id: 3, void: false },
];

type Over = Partial<Omit<Parameters<typeof sheetProgress>[0], "games" | "picked">>;

/** The counts for a member holding picks on `pickedIds`, everything else empty. */
function countFor(pickedIds: number[], over: Over = {}): SheetProgress {
  return sheetProgress({
    games: SLATE,
    picked: (gameId) => pickedIds.includes(gameId),
    lockGameId: null,
    lockDropped: false,
    tiebreakerGuess: null,
    ...over,
  });
}

describe("what is left before the deadline", () => {
  test("a Void game is off the count, and a pick on one does not fill it", () => {
    expect(countFor([])).toEqual({ liveGames: 2, picksMade: 0, lockSet: false, guessSet: false, remaining: 3 });
    // A pick left over from before the Void still exists; it just stops counting.
    expect(countFor([2])).toMatchObject({ liveGames: 2, picksMade: 0, remaining: 3 });
    expect(countFor([1, 3])).toMatchObject({ picksMade: 2, remaining: 2 });
  });

  test("open picks are one thing however many games are open", () => {
    expect(countFor([], { lockGameId: 1, tiebreakerGuess: 52 }).remaining).toBe(1);
    expect(countFor([1], { lockGameId: 1, tiebreakerGuess: 52 }).remaining).toBe(1);
    expect(countFor([1, 3], { lockGameId: 1, tiebreakerGuess: 52 }).remaining).toBe(0);
  });

  test("every pick but no Lock has one thing left", () => {
    const progress = countFor([1, 3], { tiebreakerGuess: 52 });
    expect(progress).toEqual({ liveGames: 2, picksMade: 2, lockSet: false, guessSet: true, remaining: 1 });
    expect(remainingLabel(progress, 2, false)).toBe("1 thing left before the deadline");
  });

  test("a Dropped Lock is a Lock still to set", () => {
    const progress = countFor([1, 3], { lockGameId: 2, lockDropped: true, tiebreakerGuess: 52 });
    expect(progress.lockSet).toBe(false);
    expect(progress.remaining).toBe(1);
  });

  test("a save the server never took leaves its game open", () => {
    // The pick flow reports only saved picks, so a failed save on game 3 is not one.
    expect(countFor([1], { lockGameId: 1, tiebreakerGuess: 52 })).toMatchObject({ picksMade: 1, remaining: 1 });
  });

  test("a wholly voided slate leaves no Lock to set", () => {
    const progress = sheetProgress({
      games: [{ id: 1, void: true }],
      picked: () => false,
      lockGameId: null,
      lockDropped: false,
      tiebreakerGuess: 52,
    });
    expect(progress).toEqual({ liveGames: 0, picksMade: 0, lockSet: false, guessSet: true, remaining: 0 });
  });

  test("the label reads the same wherever it is shown", () => {
    expect(remainingLabel(countFor([]), 2, false)).toBe("3 things left before the deadline");
    expect(remainingLabel(countFor([1, 3], { lockGameId: 1, tiebreakerGuess: 52 }), 2, false)).toBe(
      "You're all set for Week 2",
    );
    // Past the Deadline nothing is left to do, whatever the counts say.
    expect(remainingLabel(countFor([]), 2, true)).toBe("Week 2 is in the books");
  });
});

describe("finding the games behind the counts", () => {
  test("the live games are the slate minus its Void games", () => {
    expect(liveGames(SLATE).map((g) => g.id)).toEqual([1, 3]);
  });

  test("the first open game skips Void games and games already picked", () => {
    expect(firstOpenGame(SLATE, () => false)?.id).toBe(1);
    expect(firstOpenGame(SLATE, (id) => id === 1)?.id).toBe(3);
    expect(firstOpenGame(SLATE, (id) => id !== 2)).toBeUndefined();
  });
});
