import type { Week } from "@/db/schema";
import { defaultWeekNumber, weekParam } from "@/lib/slate/slate";

/**
 * The week a console page shows: the `?week=` the commissioner asked for when
 * it is a real week number, else the season's default Week.
 *
 * `weekParam` itself moved to `@/lib/slate/slate` once the member-side week
 * results screen needed the same parse — the week numbers it validates against
 * live there, and a screen outside the console has no business importing out
 * of `app/console/`. A seam that opens its own default Week — `resultsConsole`
 * — takes `weekParam` and decides the rest itself.
 */
export function requestedWeekNumber(existing: Week[], param: string | undefined): number {
  return weekParam(param) ?? defaultWeekNumber(existing);
}
