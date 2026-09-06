"use client";

import { formatCountdown, useDeadlineClock } from "@/lib/picks/clock";

/** "Locks in 1d 06h 42m 02s" on the server clock, or "Locked" once the Deadline has passed. */
export function DeadlineCountdown({ deadline, serverNow }: { deadline: string; serverNow: string }) {
  const { remainingMs, passed } = useDeadlineClock(deadline, serverNow);
  if (passed) return <p className="text-sm text-muted-foreground">Locked. Edits from here are corrections.</p>;
  return (
    <p className="text-sm text-muted-foreground">
      Locks in <span className="font-semibold tabular-nums text-foreground">{formatCountdown(remainingMs)}</span>
    </p>
  );
}
