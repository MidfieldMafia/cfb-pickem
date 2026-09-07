import type { CfbdClient, WeekQuery } from "./types";

const CFBD_BASE_URL = "https://api.collegefootballdata.com";

export class CfbdError extends Error {
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
  async function get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(path, CFBD_BASE_URL);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!response.ok) throw new CfbdError(response.status, path);
    return (await response.json()) as T;
  }

  const regular = ({ year, week }: WeekQuery) => ({ year, week, seasonType: "regular" });

  return {
    games: (q) => get("/games", { ...regular(q), classification: "fbs" }),
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
