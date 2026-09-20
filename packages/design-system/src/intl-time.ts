/**
 * Shared `Intl` time formatting for `LocalTime`. Formatters are the expensive
 * part of `Intl`, and one screen renders dozens of timestamps in the same few
 * shapes, so each shape is built once and kept.
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
