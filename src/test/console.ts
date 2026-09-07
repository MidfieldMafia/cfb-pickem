/**
 * A `ConsoleRoute` for a test, and the `FormData` a console form posts. Three
 * suites drive console edits — picks, slate, results — and the six lines that
 * stand a route up were about to be copied into each of them.
 *
 * Collecting the invalidations is the point rather than a convenience: which
 * screens an edit invalidates is the only thing these wrappers add over the
 * seam beneath them, so it is the thing worth asserting.
 */
import type { Member } from "@/db/schema";
import type { Db } from "@/db/types";
import type { ConsoleRoute } from "@/lib/console/route";

export interface TestRoute {
  route: ConsoleRoute;
  /** Every path the edit invalidated, in the order it asked for them. */
  revalidated: string[];
}

/**
 * A route signed in as `actor` with the clock pinned. `now` is required: every
 * console edit that writes an audit row stamps it, and a suite leaning on the
 * wall clock there would drift out of the fixture's Week.
 */
export function routeFor(db: Db, actor: Member, now: Date): TestRoute {
  const revalidated: string[] = [];
  return {
    route: {
      db,
      requireConsole: async () => actor,
      revalidate: (path) => revalidated.push(path),
      now: () => now,
    },
    revalidated,
  };
}

/** What a console form posts: every field a string, the way `FormData` carries it. */
export function form(fields: Record<string, string | number>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, String(value));
  return data;
}
