"use client";

import { useSyncExternalStore } from "react";

export type TimeStyle = "kickoff" | "deadline" | "time";

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
  /** "3:30 PM" */
  time: { hour: "numeric", minute: "2-digit" },
};

export function formatLocal(at: Date, style: TimeStyle, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", { ...FORMATS[style], timeZone }).format(at);
}

const subscribe = () => () => {};

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
