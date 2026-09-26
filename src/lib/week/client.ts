/**
 * The browser side of the week-state endpoint, and of the Game sheet's plays
 * endpoint beside it: one GET the phone repeats, carrying the ETag of what it
 * holds so an unchanged answer costs a 304 and no body. Never throws — every caller is a timer on a phone that
 * has to keep going. Client-safe: no database imports.
 */
import type { GamePlaysJson } from "@/lib/results/live-feed";
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
async function conditionalGet<T>(
  path: string,
  etag: string | null,
): Promise<{ kind: "fresh"; body: T; etag: string | null } | { kind: "unchanged" } | { kind: "failed" }> {
  try {
    const response = await fetch(path, {
      cache: "no-store",
      headers: etag ? { "if-none-match": etag } : {},
    });
    if (response.status === 304) return { kind: "unchanged" };
    if (!response.ok) return { kind: "failed" };
    return { kind: "fresh", body: (await response.json()) as T, etag: response.headers.get("etag") };
  } catch {
    return { kind: "failed" };
  }
}

export async function fetchWeekState(etag: string | null): Promise<WeekStateFetch> {
  const result = await conditionalGet<WeekStateJson>(WEEK_STATE_PATH, etag);
  return result.kind === "fresh" ? { kind: "fresh", state: result.body, etag: result.etag } : result;
}

export type GamePlaysFetch =
  | { kind: "fresh"; plays: GamePlaysJson; etag: string | null }
  | { kind: "unchanged" }
  | { kind: "failed" };

export const gamePlaysPath = (gameId: number) => `/api/week/games/${gameId}/plays`;

/** One Slate game's stored play-by-play, for the Game sheet's Recent plays. Same rules as the week state. */
export async function fetchGamePlays(gameId: number, etag: string | null): Promise<GamePlaysFetch> {
  const result = await conditionalGet<GamePlaysJson>(gamePlaysPath(gameId), etag);
  return result.kind === "fresh" ? { kind: "fresh", plays: result.body, etag: result.etag } : result;
}
