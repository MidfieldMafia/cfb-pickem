import type {
  CfbdBettingGame,
  CfbdClient,
  CfbdGame,
  CfbdGameMedia,
  CfbdGameWeather,
  CfbdPollWeek,
  CfbdPregameWinProbability,
  CfbdTeamRecord,
  CfbdTeamStat,
  CfbdVenue,
  WeekQuery,
} from "./types";

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
  async function get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(path, CFBD_BASE_URL);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!response.ok) throw new CfbdError(response.status, path);
    return (await response.json()) as T;
  }

  const regular = ({ year, week }: WeekQuery) => ({ year, week, seasonType: "regular" });

  return {
    games: (q: WeekQuery) => get<CfbdGame[]>("/games", { ...regular(q), classification: "fbs" }),
    rankings: (year: number) => get<CfbdPollWeek[]>("/rankings", { year, seasonType: "regular" }),
    lines: (q: WeekQuery) => get<CfbdBettingGame[]>("/lines", regular(q)),
    seasonGames: (year: number) => get<CfbdGame[]>("/games", { year, seasonType: "regular", classification: "fbs" }),
    records: (year: number) => get<CfbdTeamRecord[]>("/records", { year }),
    teamStats: (year: number) => get<CfbdTeamStat[]>("/stats/season", { year }),
    media: (q: WeekQuery) => get<CfbdGameMedia[]>("/games/media", regular(q)),
    pregameWinProbability: (q: WeekQuery) => get<CfbdPregameWinProbability[]>("/metrics/wp/pregame", regular(q)),
    venues: () => get<CfbdVenue[]>("/venues"),
    weather: (q: WeekQuery) => get<CfbdGameWeather[]>("/games/weather", regular(q)),
  };
}
