/**
 * Member limits shared by the server seam and the forms. Kept free of database
 * imports so a client component can read them without dragging the schema into
 * the browser bundle.
 */

/** The longest display name the console and the welcome page accept. */
export const MAX_DISPLAY_NAME = 40;

/** The longest phone number stored for the Magic Link text. */
export const MAX_PHONE = 32;

/**
 * The display-name rule for both the console and the welcome page: trimmed, and
 * between 1 and `MAX_DISPLAY_NAME` characters. Returns null when it does not
 * pass, so each caller can throw the error its own screen understands.
 */
export function cleanDisplayName(raw: string): string | null {
  const displayName = raw.trim();
  if (displayName.length === 0 || displayName.length > MAX_DISPLAY_NAME) return null;
  return displayName;
}
