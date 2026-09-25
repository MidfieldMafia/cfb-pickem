import { Refusal } from "@/lib/refusal";
import type { CfbdClient, WeekQuery } from "./types";

const CFBD_BASE_URL = "https://api.collegefootballdata.com";

/**
 * How long one game's play-by-play may take. The stale gate fetches every
 * live game inside a member's request, so a game the feed is slow on must not
 * hold the Live Board up: it times out, keeps the plays it last stored, and
 * the others carry on.
 */
export const LIVE_PLAYS_TIMEOUT_MS = 8_000;

/**
 * A `Refusal`, not a fault: the feed being down is not the commissioner's
 * mistake, but "Check the feed now" is a button they pressed, so the honest
 * answer is a sentence under it rather than the error page. The message names
 * the service and the status so they can tell an outage from a bad key.
 */
export class CfbdError extends Refusal {
  constructor(
    public readonly status: number,
    path: string,
  ) {
    super(`CollegeFootballData returned ${status} for ${path}.`);
  }
}

/**
 * The live client. Server-side only: the key never reaches the browser.
 * Quota is monthly (5,000 calls on the $1 tier), so callers cache results.
 */
export function httpCfbd(apiKey: string, fetchImpl: typeof fetch = fetch): CfbdClient {
  async function get<T>(
    path: string,
    params: Record<string, string | number> = {},
    signal?: AbortSignal,
  ): Promise<T> {
    const url = new URL(path, CFBD_BASE_URL);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${apiKey}` }, signal });
    if (!response.ok) throw new CfbdError(response.status, path);
    return (await response.json()) as T;
  }

  const regular = ({ year, week }: WeekQuery) => ({ year, week, seasonType: "regular" });

  return {
    games: (q) => get("/games", { ...regular(q), classification: "fbs" }),
    // No year or week: the endpoint has neither, and answers the week being played.
    scoreboard: () => get("/scoreboard", { classification: "fbs" }),
    livePlays: (gameId) => get("/live/plays", { gameId }, AbortSignal.timeout(LIVE_PLAYS_TIMEOUT_MS)),
    rankings: (year) => get("/rankings", { year, seasonType: "regular" }),
    lines: (q) => get("/lines", regular(q)),
    seasonGames: (year) => get("/games", { year, seasonType: "regular", classification: "fbs" }),
    records: (year) => get("/records", { year }),
    teamStats: (year) => get("/stats/season", { year }),
    media: (q) => get("/games/media", regular(q)),
    pregameWinProbability: (q) => get("/metrics/wp/pregame", regular(q)),
    venues: () => get("/venues"),
    weather: (q) => get("/games/weather", regular(q)),
  };
}
