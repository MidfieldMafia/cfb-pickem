/**
 * Phone numbers are stored as the commissioner typed them (`members.phone`
 * is free text and unique), but a provider wants E.164. This is the one place
 * that turns one into the other, so a number that will not convert is a
 * reason the app cannot text someone rather than a failed send.
 *
 * Kept free of database imports, like `limits.ts`.
 */

/** "+15125550123" for anything a US or international number can plausibly be; null otherwise. */
export function toE164(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  // A US number: area code and exchange never start with 0 or 1.
  if (/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return `+1${digits}`;
  if (/^1[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return `+${digits}`;
  return null;
}
