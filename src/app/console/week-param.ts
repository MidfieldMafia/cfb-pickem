import type { Week } from "@/db/schema";
import { defaultWeekNumber, isWeekNumber } from "@/lib/slate/slate";

/**
 * The `?week=` a commissioner asked for, when it is a real week number, and
 * undefined when it is missing or nonsense. A seam that opens its own default
 * Week — `resultsConsole` — takes this and decides the rest itself.
 */
export function weekParam(param: string | undefined): number | undefined {
  const requested = Number(param);
  return isWeekNumber(requested) ? requested : undefined;
}

/**
 * The week a console page shows: the `?week=` the commissioner asked for when
 * it is a real week number, else the season's default Week.
 */
export function requestedWeekNumber(existing: Week[], param: string | undefined): number {
  return weekParam(param) ?? defaultWeekNumber(existing);
}
