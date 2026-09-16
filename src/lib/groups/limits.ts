/**
 * Group limits shared by the server seam and the forms. Kept free of database
 * imports, like `members/limits.ts`, so a client component can read them.
 */

/** The longest group name accepted, the same as a display name. */
export const MAX_GROUP_NAME = 40;

/** Trimmed, and between 1 and `MAX_GROUP_NAME` characters; null when it does not pass. */
export function cleanGroupName(raw: string): string | null {
  const name = raw.trim();
  if (name.length === 0 || name.length > MAX_GROUP_NAME) return null;
  return name;
}
