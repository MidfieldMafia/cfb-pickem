import type { CaptureResult } from "posthog-js";

/**
 * A Magic Link (`/m/<token>`) signs its holder in, and a Join Link
 * (`/join/<token>`) adds whoever opens it to a group. Both tokens sit in the
 * URL, and PostHog records URLs on every event — the current page, the
 * referrer, the first page a person ever landed on — so each one leaves the
 * browser with the token swapped out.
 */
const SECRET_PATH = /\/(m|join)\/[^/?#]+/g;

export function scrubUrl(value: string): string {
  return value.replace(SECRET_PATH, "/$1/[token]");
}

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") return scrubUrl(value);
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, scrubValue(inner)]));
  }
  return value;
}

/**
 * PostHog's `before_send` hook. Walks every property, not a list of known URL
 * keys: the keys PostHog fills in change between releases, and exception
 * events nest URLs inside stack frames.
 */
export function scrubEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event) return event;
  return {
    ...event,
    properties: scrubValue(event.properties) as CaptureResult["properties"],
    ...(event.$set && { $set: scrubValue(event.$set) as CaptureResult["$set"] }),
    ...(event.$set_once && { $set_once: scrubValue(event.$set_once) as CaptureResult["$set_once"] }),
  };
}
