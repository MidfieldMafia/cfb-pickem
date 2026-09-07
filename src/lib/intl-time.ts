/**
 * Shared `Intl` time formatting. Formatters are the expensive part of `Intl`,
 * and one screen renders dozens of timestamps in the same few shapes, so each
 * shape is built once and kept. Plain module, no "use client": the slate
 * builder formats on the server and the pick screens on the phone.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Keyed on the options themselves. A hand-passed key had to be edited in step
 * with them, and a caller that added a field without changing its key would
 * silently keep the old formatter.
 */
export function formatterFor(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", options);
    formatters.set(key, formatter);
  }
  return formatter;
}

/**
 * Hour of the day in a named zone, 0–23. Falls back to UTC when the zone is
 * unknown, because a venue's timezone comes from the feed and may be missing.
 */
export function hourIn(at: Date | string, timeZone: string): number {
  const date = typeof at === "string" ? new Date(at) : at;
  try {
    return Number(formatterFor({ hour: "numeric", hourCycle: "h23", timeZone }).format(date));
  } catch {
    return date.getUTCHours();
  }
}
