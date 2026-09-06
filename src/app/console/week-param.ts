import type { Week } from "@/db/schema";
import { isWeekNumber } from "@/lib/slate/slate";

/**
 * The week a console page shows: the `?week=` the commissioner asked for
 * when it is a real week number, else the latest published week, else the
 * latest week that exists, else 1.
 */
export function requestedWeekNumber(existing: Week[], param: string | undefined): number {
  const requested = Number(param);
  if (isWeekNumber(requested)) return requested;
  return existing.filter((w) => w.published).at(-1)?.weekNumber ?? existing.at(-1)?.weekNumber ?? 1;
}
