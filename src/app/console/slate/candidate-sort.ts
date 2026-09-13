import type { CandidateGame } from "@/lib/cfbd/candidates";

/** The two columns a commissioner can sort the candidate table by. */
export type SortKey = "kickoff" | "spread";
export type SortDir = "asc" | "desc";

export const SORTS: { key: SortKey; label: string }[] = [
  { key: "kickoff", label: "Kickoff" },
  { key: "spread", label: "Spread" },
];

/** The `?sort=` a commissioner asked for, or "kickoff" when missing or nonsense — the feed's own order. */
export function sortParam(param: string | undefined): SortKey {
  return SORTS.some((s) => s.key === param) ? (param as SortKey) : "kickoff";
}

/** The `?dir=` a commissioner asked for, or "asc" when missing or nonsense — each column's natural direction. */
export function dirParam(param: string | undefined): SortDir {
  return param === "desc" ? "desc" : "asc";
}

/** Whether a candidate has no real position in the given sort's order. */
function isUnplaced(candidate: CandidateGame, sort: SortKey): boolean {
  return sort === "kickoff" ? candidate.kickoffTbd : candidate.spreadValue === null;
}

function compare(a: CandidateGame, b: CandidateGame, sort: SortKey): number {
  if (sort === "kickoff") return a.kickoff.getTime() - b.kickoff.getTime() || a.cfbdGameId - b.cfbdGameId;
  return Math.abs(a.spreadValue!) - Math.abs(b.spreadValue!) || a.cfbdGameId - b.cfbdGameId;
}

/**
 * Orders candidates by kickoff (ascending: earliest first) or by spread
 * (ascending: tightest absolute margin first) and applies direction only to
 * the candidates with a real position. A TBD kickoff and a line-less spread
 * both sink to the bottom regardless of direction — an unknown value isn't a
 * point in the order that flipping direction should move — so they are
 * carved out before the sort/reverse and appended afterward, in the order
 * they arrived (already kickoff-ascending from `weekCandidates`).
 */
export function sortCandidates(candidates: CandidateGame[], sort: SortKey, dir: SortDir): CandidateGame[] {
  const placed: CandidateGame[] = [];
  const unplaced: CandidateGame[] = [];
  for (const c of candidates) (isUnplaced(c, sort) ? unplaced : placed).push(c);

  placed.sort((a, b) => compare(a, b, sort));
  if (dir === "desc") placed.reverse();

  return [...placed, ...unplaced];
}
