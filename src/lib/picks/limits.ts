/**
 * Limits shared by the server seam and the screens. Kept free of database
 * imports so a client component can read them without dragging the schema
 * into the browser bundle.
 */

/** The highest combined score the Tiebreaker Guess accepts. The record is 145; nobody needs more. */
export const MAX_TIEBREAKER_GUESS = 200;
