"use client";

import { useSyncExternalStore } from "react";
import { formatterFor } from "@/lib/intl-time";

export type TimeStyle = "kickoff" | "deadline" | "slot";

const FORMATS: Record<TimeStyle, Intl.DateTimeFormatOptions> = {
  /** "Sat, Sep 12, 3:30 PM" */
  kickoff: { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
  /** "Sat, Sep 12, 3:30 PM CDT" */
  deadline: {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  },
  /** "Sat 12:00 PM" — the kickoff slot on the Reveal and the results console. */
  slot: { weekday: "short", hour: "numeric", minute: "2-digit" },
};

function formatLocal(at: Date, style: TimeStyle, timeZone?: string): string {
  return formatterFor({ ...FORMATS[style], timeZone }, `${style}|${timeZone ?? ""}`).format(at);
}

const subscribe = () => () => {};

/**
 * False on the server and on the first client pass, true after hydration. For
 * the handful of places that must render the same markup both times and only
 * then reach for something browser-only, such as the viewer's time zone.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

/**
 * A timestamp in the viewer's own time zone. The server renders UTC; the
 * browser swaps in local time on hydration without a mismatch warning.
 */
export function LocalTime({ at, style = "kickoff" }: { at: Date | string; style?: TimeStyle }) {
  const date = typeof at === "string" ? new Date(at) : at;
  const text = useSyncExternalStore(
    subscribe,
    () => formatLocal(date, style),
    () => formatLocal(date, style, "UTC"),
  );
  return <time dateTime={date.toISOString()}>{text}</time>;
}
