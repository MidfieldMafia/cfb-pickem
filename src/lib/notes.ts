/**
 * The rule for a commissioner's note — the Void note and the Result Override
 * note — in the one place the server seams and the forms can both read it.
 * Kept free of database imports because the console forms are client
 * components and set their `maxLength` from this.
 *
 * There used to be two answers: the Override note trimmed, refused empty, and
 * capped at 200, while the Void note trimmed, refused empty, and stopped
 * there — so a paste of any length reached the column. The three form fields
 * asked for 200, 120 and 120, and `maxLength` is a hint a form post need not
 * honour, so the server cap was the only real one and one of them had none.
 */

/** The longest note either kind accepts. */
export const MAX_NOTE = 200;

/**
 * The note rule, as the message to show or null when the note is good. Each
 * caller throws it as the refusal its own screen understands, the way
 * `tiebreakerGuessError` already does for the Tiebreaker Guess.
 */
export function noteError(raw: string): string | null {
  const note = raw.trim();
  if (note.length === 0) return "Say why in the note.";
  if (note.length > MAX_NOTE) return `Keep the note under ${MAX_NOTE} characters.`;
  return null;
}
