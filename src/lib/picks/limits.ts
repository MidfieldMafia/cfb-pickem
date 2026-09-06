/**
 * Limits shared by the server seam and the screens. Kept free of database
 * imports so a client component can read them without dragging the schema
 * into the browser bundle.
 */

/** The highest combined score the Tiebreaker Guess accepts. The record is 145; nobody needs more. */
export const MAX_TIEBREAKER_GUESS = 200;

/**
 * The Tiebreaker Guess rule, in the one place both sides can read it: the
 * message to show, or null when the guess is good. The screen renders it as the
 * field error; the server seam throws it.
 */
export function tiebreakerGuessError(guess: number): string | null {
  if (!Number.isInteger(guess) || guess < 0 || guess > MAX_TIEBREAKER_GUESS) {
    return `The guess is a whole number of points, 0 to ${MAX_TIEBREAKER_GUESS}.`;
  }
  return null;
}
