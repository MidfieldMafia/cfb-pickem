/**
 * When the live heartbeat pings (#546): from each Game's kickoff hour to five
 * hours after its kickoff, in UTC, and never on a day with no Game. The slowest
 * game this season ran 4.0 hours from kickoff to its last play, so five covers
 * overtime with room; a game still running past its window updates from member
 * traffic, as it always has.
 *
 * The answer is one QStash schedule per UTC date, its cron pinned to that date
 * (`* 17-23 7 11 *`), because a cron can only name hours within one day. A
 * date-pinned cron would fire again a year later, which is why the sync deletes
 * every schedule this does not name.
 */
import type { Game } from "@/db/schema";

/** One QStash schedule: its id names its UTC date, and its cron pings every minute of the window's hours. */
export interface HeartbeatWindow {
  id: string;
  cron: string;
}

const HOUR = 3_600_000;

/** How long after kickoff the heartbeat keeps pinging. */
export const WINDOW_HOURS = 5;

export function heartbeatWindows(games: Pick<Game, "kickoff" | "void">[], now: Date): HeartbeatWindow[] {
  // Every UTC hour a window touches, as hours since the epoch: overlapping
  // windows merge for free, and a gap between them stays a gap.
  const hours = new Set<number>();
  for (const game of games) {
    if (game.void) continue;
    const start = game.kickoff.getTime();
    const end = start + WINDOW_HOURS * HOUR;
    if (end <= now.getTime()) continue;
    for (let hour = Math.floor(start / HOUR); hour * HOUR < end; hour++) hours.add(hour);
  }

  const byDate = new Map<string, number[]>();
  for (const hour of [...hours].sort((a, b) => a - b)) {
    const date = new Date(hour * HOUR).toISOString().slice(0, 10);
    byDate.set(date, [...(byDate.get(date) ?? []), hour]);
  }

  // A date whose hours are all over drops out: a window still running past
  // midnight keeps only the date it is on. A date still to come or under way
  // keeps its whole cron, so a sync mid-game leaves the schedule as it was.
  const live = [...byDate].filter(([, epochHours]) => (epochHours.at(-1)! + 1) * HOUR > now.getTime());
  return live.map(([date, epochHours]) => {
    const dayHours = epochHours.map((hour) => new Date(hour * HOUR).getUTCHours());
    const [, month, day] = date.split("-").map(Number);
    return { id: `slate-live-${date}`, cron: `* ${ranges(dayHours)} ${day} ${month} *` };
  });
}

/** Sorted hours as a cron field: `[0, 1, 2, 16, 17]` is `0-2,16-17`, and a lone hour is itself. */
function ranges(hours: number[]): string {
  const runs: [number, number][] = [];
  for (const hour of hours) {
    const last = runs.at(-1);
    if (last && hour === last[1] + 1) last[1] = hour;
    else runs.push([hour, hour]);
  }
  return runs.map(([from, to]) => (from === to ? `${from}` : `${from}-${to}`)).join(",");
}
