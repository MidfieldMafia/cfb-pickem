/**
 * The browser side of the week-state endpoint: one GET the Live Board
 * repeats, carrying the ETag of the state it holds so an unchanged Week costs
 * a 304 and no body. Never throws — every caller is a timer on a phone that
 * has to keep going. Client-safe: no database imports.
 */
import type { WeekStateJson } from "./json";

export type WeekStateFetch =
  | { kind: "fresh"; state: WeekStateJson; etag: string | null }
  /** The server matched the ETag: what the phone holds is what it would have sent. */
  | { kind: "unchanged" }
  | { kind: "failed" };

export const WEEK_STATE_PATH = "/api/week/state";

/**
 * `cache: "no-store"` matters twice over: it keeps the browser's own HTTP
 * cache out of the way, and it is what lets a 304 reach this code as a 304 —
 * in the default mode the browser would answer it from cache as a 200 and the
 * phone could not tell "unchanged" from "here it is again".
 */
export async function fetchWeekState(etag: string | null): Promise<WeekStateFetch> {
  try {
    const response = await fetch(WEEK_STATE_PATH, {
      cache: "no-store",
      headers: etag ? { "if-none-match": etag } : {},
    });
    if (response.status === 304) return { kind: "unchanged" };
    if (!response.ok) return { kind: "failed" };
    return { kind: "fresh", state: (await response.json()) as WeekStateJson, etag: response.headers.get("etag") };
  } catch {
    return { kind: "failed" };
  }
}
