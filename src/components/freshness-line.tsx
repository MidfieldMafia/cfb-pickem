"use client";

import { RefreshCw } from "lucide-react";
import { useSyncExternalStore } from "react";

import { useDeadlineClock } from "@/lib/picks/clock";
import { agoLabel, dueInLabel } from "@/lib/week/freshness";

const subscribeEverySecond = (onTick: () => void) => {
  const timer = setInterval(onTick, 1000);
  return () => clearInterval(timer);
};

/**
 * The reassurance Norah asked pull-to-refresh for (#95): when the scores on
 * screen were last confirmed current, and when the next check is due. Ticks
 * on its own between polls rather than freezing at the render that set it —
 * `useDeadlineClock` already does exactly that against the server's clock, so
 * this reads it backwards: "remaining" to a `serverNow` already in the past
 * is the negative of how long ago it was. `nextPollAt` is the phone's own
 * clock, so it needs no such correction.
 *
 * `nextPollAt` null leaves the "next check" half off. The Live Board passes
 * null only before its first poll is scheduled; the Leaderboard's live card
 * always does, because that screen does not poll, and promising a check it
 * will never make would be the one wrong thing this line could say.
 */
export function FreshnessLine({
  serverNow,
  nextPollAt,
  icon = true,
}: {
  serverNow: string;
  nextPollAt: number | null;
  icon?: boolean;
}) {
  const { remainingMs } = useDeadlineClock(serverNow, serverNow);
  const elapsedMs = Math.max(0, -remainingMs);
  // `nextPollAt` is stamped on the phone's own clock, so ticking this against
  // it needs no server-offset correction — just a re-render every second,
  // read the sanctioned way rather than calling `Date.now()` in the render body.
  const clientNow = useSyncExternalStore(subscribeEverySecond, () => Date.now(), () => 0);
  const dueInMs = nextPollAt === null ? null : Math.max(0, nextPollAt - clientNow);
  return (
    <p className="flex items-center gap-1 text-xs text-muted-foreground">
      {icon ? <RefreshCw size={11} aria-hidden /> : null}
      Updated {agoLabel(elapsedMs)}
      {dueInMs === null ? null : ` · next check ${dueInLabel(dueInMs)}`}
    </p>
  );
}
