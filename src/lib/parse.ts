/**
 * Boundary parsing shared by the route handlers and the server actions. Both
 * take numbers from outside — a JSON body, a form field — and both must reject
 * anything Postgres `integer` cannot hold, so a bad request is a message rather
 * than a database error.
 */

/** Postgres `integer` range; anything outside is a bad request. */
export const MAX_INT = 2_147_483_647;

/**
 * A non-negative Postgres `integer` from anything, or null when it is not one.
 *
 * `max` narrows the upper bound for a field with a domain range of its own, so
 * that field's caller words one refusal for every way its value can be wrong
 * rather than wording the low end and leaving the high end to a second check
 * further in — which is how a score of `-1` came to be reported as a missing
 * field. Anything above `MAX_INT` is still a bad request, whatever `max` says.
 */
export function safeInteger(value: unknown, max: number = MAX_INT): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0 || n > Math.min(max, MAX_INT)) return null;
  return n;
}

/** A field to parse: a submitted form, or a decoded JSON body. */
export type Fields = FormData | Record<string, unknown>;

function raw(source: Fields, name: string): unknown {
  return source instanceof FormData ? source.get(name) : source[name];
}

/**
 * A required whole number from a form field or a JSON body, or the refusal the
 * caller words. One parser for both, because the only thing that ever differed
 * between the four copies of it was which error class they raised and what
 * they called the field.
 *
 * A form field arrives as a string and is coerced; a JSON body must carry a
 * real number, because a numeric string there is our own client malfunctioning
 * rather than a person typing.
 *
 * `max` is the field's own upper bound where it has one; the refusal `fail`
 * words then covers the whole range, and nothing downstream re-checks it.
 */
export function integerField(
  source: Fields,
  name: string,
  fail: (name: string) => Error,
  max: number = MAX_INT,
): number {
  const value = raw(source, name);
  const parsed = source instanceof FormData || typeof value === "number" ? safeInteger(value, max) : null;
  if (parsed === null) throw fail(name);
  return parsed;
}

/**
 * An optional whole number: an empty field clears the value, anything else has
 * to parse. The old copy of this returned `NaN` for a field that did not, which
 * one caller checked for and another did not — so a typo cleared the Lock on
 * one form and reached the database as `NaN` on the other.
 */
export function optionalIntegerField(source: Fields, name: string, fail: (name: string) => Error): number | null {
  const value = raw(source, name);
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return integerField(source, name, fail);
}
