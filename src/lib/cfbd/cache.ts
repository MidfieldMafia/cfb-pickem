import type { CfbdClient, WeekQuery } from "./types";

/** The shared client with the Refresh button's escape hatch on it. */
export interface CachingCfbdClient extends CfbdClient {
  invalidate(): void;
}

/**
 * The shared cache in front of CollegeFootballData. Quota is monthly, so a
 * console page that re-renders on every filter click must not cost ten
 * calls each time. Entries live in process memory for `ttlMs`; `invalidate`
 * forces the next read through (the Refresh button).
 */
export function cachingCfbd(inner: CfbdClient, ttlMs: number, now: () => number = Date.now): CachingCfbdClient {
  const entries = new Map<string, { expires: number; value: Promise<unknown> }>();

  function remember<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = entries.get(key);
    if (hit && hit.expires > now()) return hit.value as Promise<T>;
    const value = load().catch((error) => {
      entries.delete(key);
      throw error;
    });
    entries.set(key, { expires: now() + ttlMs, value });
    return value;
  }

  const weekKey = (name: string, q: WeekQuery) => `${name}:${q.year}:${q.week}`;

  return {
    games: (q) => remember(weekKey("games", q), () => inner.games(q)),
    rankings: (year) => remember(`rankings:${year}`, () => inner.rankings(year)),
    lines: (q) => remember(weekKey("lines", q), () => inner.lines(q)),
    seasonGames: (year) => remember(`seasonGames:${year}`, () => inner.seasonGames(year)),
    records: (year) => remember(`records:${year}`, () => inner.records(year)),
    teamStats: (year) => remember(`teamStats:${year}`, () => inner.teamStats(year)),
    media: (q) => remember(weekKey("media", q), () => inner.media(q)),
    pregameWinProbability: (q) => remember(weekKey("wp", q), () => inner.pregameWinProbability(q)),
    venues: () => remember("venues", () => inner.venues()),
    weather: (q) => remember(weekKey("weather", q), () => inner.weather(q)),
    invalidate: () => entries.clear(),
  };
}
