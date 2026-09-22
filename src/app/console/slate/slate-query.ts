import type { Filter } from "./candidate-filter";
import type { SortDir, SortKey } from "./candidate-sort";

/**
 * Everything the slate builder's URL carries. Each control on the page changes
 * one field and keeps the rest, so it asks for `.with({...})` and the query
 * writes the href: a default never shows up in the URL ("absent means
 * default"), and the parameters always come out in the same order.
 */
export interface SlateQuery {
  week: number;
  filter: Filter;
  fbsOnly: boolean;
  q: string;
  sort: SortKey;
  dir: SortDir;
}

export function slateQuery(query: SlateQuery) {
  return {
    ...query,
    with: (change: Partial<SlateQuery>) => slateQuery({ ...query, ...change }),
    /** What a repeat click on `key` sorts by: flips direction, and a first click starts ascending. */
    sortedBy: (key: SortKey) =>
      slateQuery({ ...query, sort: key, dir: query.sort === key && query.dir === "asc" ? "desc" : "asc" }),
    href: () => `/console/slate?${params(query)}`,
  };
}

function params({ week, filter, fbsOnly, q, sort, dir }: SlateQuery): URLSearchParams {
  const p = new URLSearchParams({ week: String(week) });
  if (filter !== "all") p.set("filter", filter);
  if (!fbsOnly) p.set("fbs", "0");
  if (q) p.set("q", q);
  if (sort !== "kickoff") p.set("sort", sort);
  if (dir !== "asc") p.set("dir", dir);
  return p;
}
