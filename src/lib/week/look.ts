/**
 * The Look a Week wears: a presentation every member screen puts on together
 * for one Week of the season, and takes off with it, so no deploy is needed to
 * switch it off. Rivalry Week is the first (#588); the postseason makeover
 * will be another answer from the same seam.
 */
import type { Game, Season, Week } from "@/db/schema";
import { weekSettled } from "@/lib/results/engine";

export type WeekLook = "rivalry";

/** The Weeks that wear the Rivalry Week Look, by season year and week number. */
const RIVALRY_WEEKS: readonly { year: number; weekNumber: number }[] = [{ year: 2026, weekNumber: 13 }];

/** What `weekLook` reads of a Slate: the shape `publishedSlate` answers with. */
export interface LookSlate {
  season: Pick<Season, "year">;
  week: Pick<Week, "weekNumber" | "published">;
  games: readonly Game[];
}

/**
 * The Look for the published Week at `now`, or null for the default look. A
 * Week wears its Look from the moment its Slate is published until the Week is
 * settled, by `weekSettled`, the same rule the Week's own state reads: after
 * that the Regular Season Champion presentation takes over.
 */
export function weekLook(slate: LookSlate | null, now: Date): WeekLook | null {
  if (!slate || !slate.week.published) return null;
  const rivalry = RIVALRY_WEEKS.some((w) => w.year === slate.season.year && w.weekNumber === slate.week.weekNumber);
  if (!rivalry) return null;
  return weekSettled(slate.games, now) ? null : "rivalry";
}
