/**
 * How the Game sheet names a kickoff before it happens, in the viewer's own
 * time zone: the header's relative day ("Today", "Tomorrow", "Saturday", "Sat,
 * Sep 27") and time, and the Game information card's full line. The rules are
 * the resolution of "What does the Game sheet header look like before
 * kickoff?" (#318).
 *
 * Pure: the zone is passed in, so the server renders UTC and the browser its
 * own zone, as `LocalTime` does. Client-safe.
 */
import { formatterFor } from "@/lib/intl-time";

/** The calendar day `at` falls on in `timeZone`, as a count of days, so two days can be subtracted. */
function dayNumber(at: Date, timeZone: string | undefined): number {
  const parts = formatterFor({ year: "numeric", month: "numeric", day: "numeric", timeZone }).formatToParts(at);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day")) / 86_400_000;
}

/** "Today", "Tomorrow", the weekday within the coming week, then "Sat, Sep 27". */
export function kickoffDay(kickoff: Date, now: Date, timeZone?: string): string {
  const days = dayNumber(kickoff, timeZone) - dayNumber(now, timeZone);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1 && days < 7) return formatterFor({ weekday: "long", timeZone }).format(kickoff);
  return formatterFor({ weekday: "short", month: "short", day: "numeric", timeZone }).format(kickoff);
}

/** "7:30 PM". */
export function kickoffTime(kickoff: Date, timeZone?: string): string {
  return formatterFor({ hour: "numeric", minute: "2-digit", timeZone }).format(kickoff);
}

/** "7:30 PM, Saturday, September 27". */
export function kickoffLine(kickoff: Date, timeZone?: string): string {
  const date = formatterFor({ weekday: "long", month: "long", day: "numeric", timeZone }).format(kickoff);
  return `${kickoffTime(kickoff, timeZone)}, ${date}`;
}
