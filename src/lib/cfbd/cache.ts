import type { CfbdBettingGame, CfbdClient, CfbdGame, CfbdPollWeek, WeekQuery } from "./types";

/**
 * The shared cache in front of CollegeFootballData. Quota is monthly, so a
 * console page that re-renders on every filter click must not cost three
 * calls each time. Entries live in process memory for `ttlMs`; `invalidate`
 * forces the next read through (the Refresh button).
 */
export function cachingCfbd(inner: CfbdClient, ttlMs: number, now: () => number = Date.now): CfbdClient & {
  invalidate(): void;
} {
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

  return {
    games: (q: WeekQuery) => remember<CfbdGame[]>(`games:${q.year}:${q.week}`, () => inner.games(q)),
    rankings: (year: number) => remember<CfbdPollWeek[]>(`rankings:${year}`, () => inner.rankings(year)),
    lines: (q: WeekQuery) => remember<CfbdBettingGame[]>(`lines:${q.year}:${q.week}`, () => inner.lines(q)),
    invalidate: () => entries.clear(),
  };
}
