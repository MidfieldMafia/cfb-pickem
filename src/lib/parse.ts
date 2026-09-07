/**
 * Boundary parsing shared by the route handlers and the server actions. Both
 * take numbers from outside — a JSON body, a form field — and both must reject
 * anything Postgres `integer` cannot hold, so a bad request is a message rather
 * than a database error.
 */

/** Postgres `integer` range; anything outside is a bad request. */
export const MAX_INT = 2_147_483_647;

/** A non-negative Postgres `integer` from anything, or null when it is not one. */
export function safeInteger(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0 || n > MAX_INT) return null;
  return n;
}

/**
 * A required integer form field. Every server action wrapped `safeInteger` in
 * this same throw, down to the sentence, so the only thing left to each is
 * which refusal it raises.
 */
export function integerField(formData: FormData, name: string, fail: (message: string) => Error): number {
  const value = safeInteger(formData.get(name));
  if (value === null) throw fail(`Missing ${name}.`);
  return value;
}
