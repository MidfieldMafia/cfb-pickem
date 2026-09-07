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

/** The two doors onto one shared cache: the everyday read, and the read that must go through. */
export interface SharedFeed {
  cfbd(): CfbdClient;
  freshCfbd(): CfbdClient;
}

/**
 * The two doors onto one shared cache — the arrangement `cfbd()` and
 * `freshCfbd()` wire the env key into. Member traffic reads whatever is there;
 * a commissioner's refresh empties the cache first, so its read goes through
 * to CollegeFootballData *and* leaves behind what it read.
 *
 * The second half is the point. A refresh that skipped the cache instead would
 * leave it serving the scores the refresh just corrected, and the results
 * stale gate reopens after five minutes while an entry lives for ten — so the
 * next member visit would ingest the old feed back over the new scores, and
 * the score on screen would go backwards. Kept here, apart from the env key,
 * so that arrangement is under test.
 */
export function sharedFeed(inner: CfbdClient, ttlMs: number, now?: () => number): SharedFeed {
  const cache = cachingCfbd(inner, ttlMs, now);
  return {
    cfbd: (): CfbdClient => cache,
    freshCfbd: (): CfbdClient => {
      cache.invalidate();
      return cache;
    },
  };
}
