/**
 * How the Live Board turns a gap of milliseconds into words a member reads at
 * a glance, for the freshness line `live-board.tsx` puts under the toggle
 * (#95): coarse enough not to jitter on every tick, and rounded so neither
 * label ever promises more than it knows — `agoLabel` never claims a moment
 * that has not happened, `dueInLabel` never claims a check that has.
 *
 * Pure and client-safe, like `poll.ts` beside it: no React, no database.
 */

/** "just now", "12s ago", "4m ago", "1h 06m ago". Clamped at zero, so a poll's own latency cannot read as time travel. */
export function agoLabel(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  if (totalSeconds < 10) return "just now";
  if (totalSeconds < 60) return `${totalSeconds}s ago`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m ago`;
}

/** "in 28s", "in 4m". Rounds up and floors at one second, so the label never announces a check as already due. */
export function dueInLabel(msUntil: number): string {
  const totalSeconds = Math.max(1, Math.ceil(msUntil / 1000));
  if (totalSeconds < 60) return `in ${totalSeconds}s`;
  const minutes = Math.ceil(totalSeconds / 60);
  return `in ${minutes}m`;
}
