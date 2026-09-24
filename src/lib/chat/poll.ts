/**
 * How often the Chat screen and the tab's badge ask the server again (#248).
 * Polling, the Live Board's way, rather than a live connection (#177): every
 * poll is one small read, and an unchanged thread costs a 304.
 *
 * Client-safe: no database imports.
 */

/** While the thread is moving: a reply a few seconds late still reads as a conversation. */
export const ACTIVE_POLL_MS = 4_000;
/** Once nothing has come or gone for `IDLE_AFTER_MS`. */
export const IDLE_POLL_MS = 20_000;
/** How long a quiet thread keeps the fast cadence. */
export const IDLE_AFTER_MS = 2 * 60_000;
/** The badge on the other tabs: a count a minute old is still news. */
export const BADGE_POLL_MS = 60_000;

/** Milliseconds until the thread's next poll, from how long it has been quiet on this phone. */
export function nextChatPollMs(quietForMs: number): number {
  return quietForMs < IDLE_AFTER_MS ? ACTIVE_POLL_MS : IDLE_POLL_MS;
}
