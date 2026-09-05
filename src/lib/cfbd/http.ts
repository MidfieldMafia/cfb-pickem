import type { CfbdBettingGame, CfbdClient, CfbdGame, CfbdPollWeek, WeekQuery } from "./types";

export const CFBD_BASE_URL = "https://api.collegefootballdata.com";

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
  async function get<T>(path: string, params: Record<string, string | number>): Promise<T> {
    const url = new URL(path, CFBD_BASE_URL);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!response.ok) throw new CfbdError(response.status, path);
    return (await response.json()) as T;
  }

  return {
    games: ({ year, week }: WeekQuery) =>
      get<CfbdGame[]>("/games", { year, week, seasonType: "regular", classification: "fbs" }),
    rankings: (year: number) => get<CfbdPollWeek[]>("/rankings", { year, seasonType: "regular" }),
    lines: ({ year, week }: WeekQuery) => get<CfbdBettingGame[]>("/lines", { year, week, seasonType: "regular" }),
  };
}

/** The production client, keyed from the environment. Throws if the key is missing. */
export function cfbdFromEnv(): CfbdClient {
  const apiKey = process.env.CFBD_API_KEY;
  if (!apiKey) throw new Error("CFBD_API_KEY is not set; run `vercel env pull .env.local`.");
  return httpCfbd(apiKey);
}
