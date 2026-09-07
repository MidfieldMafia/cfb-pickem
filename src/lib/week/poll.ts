/**
 * How often the Live Board asks the server again. Decided here, from the
 * state the phone already holds, rather than on the screen — the cadence is a
 * rule about the Week, not a rendering choice, and a test can hold it to the
 * numbers the ticket set.
 *
 * Every poll reads the database only. The feed is driven by the server's own
 * stale gate on the way through, so however many phones poll however often,
 * CollegeFootballData is called at most once per interval across all of them.
 *
 * Client-safe, like `picks/progress.ts`: no database imports.
 */
import type { WeekStateJson } from "./json";

/** While any slate game is under way: a score thirty seconds old is a live one. */
export const LIVE_POLL_MS = 30_000;
/** Between games, and before the first kickoff: the next thing to learn is a kickoff, and five minutes is soon enough. */
export const IDLE_POLL_MS = 5 * 60_000;

/**
 * Milliseconds until the next poll, or null once every game is final and
 * there is nothing left that a poll could change.
 */
export function nextPollMs(state: Pick<WeekStateJson, "complete" | "games">): number | null {
  if (state.complete) return null;
  return state.games.some((row) => row.result.live !== null) ? LIVE_POLL_MS : IDLE_POLL_MS;
}
