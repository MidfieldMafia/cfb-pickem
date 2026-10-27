"use client";

import { useSyncExternalStore } from "react";
import { formatterFor } from "./intl-time";

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

/**
 * Joined from the parts rather than `format()`: the parts agree across
 * engines, the literals between them do not. WebKit writes "Sat, Sep 26 at
 * 3:30 PM" where Node writes "Sat, Sep 26, 3:30 PM", and ICU versions differ
 * on the space before PM, so the server's text failed to hydrate on every
 * iPhone (React #418, #515).
 */
function formatLocal(at: Date, style: TimeStyle, timeZone?: string): string {
  const parts = formatterFor({ ...FORMATS[style], timeZone }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  const time = `${part("hour")}:${part("minute")} ${part("dayPeriod")}`;
  if (style === "slot") return `${part("weekday")} ${time}`;
  const text = `${part("weekday")}, ${part("month")} ${part("day")}, ${time}`;
  return style === "deadline" ? `${text} ${part("timeZoneName")}` : text;
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
