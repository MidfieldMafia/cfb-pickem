import type { CandidateGame } from "@/lib/cfbd/candidates";

/** The three ways a commissioner narrows the week's candidates. */
export type Filter = "all" | "ranked" | "sec";

export const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All FBS" },
  { key: "ranked", label: "Ranked" },
  { key: "sec", label: "SEC" },
];

/** The `?filter=` a commissioner asked for, or "all" when it is missing or nonsense. */
export function filterParam(param: string | undefined): Filter {
  return FILTERS.some((f) => f.key === param) ? (param as Filter) : "all";
}

/**
 * Whether a feed candidate survives the pills and the search box. Ranked means
 * either side is ranked and SEC means either side is in it — a rule about the
 * matchup rather than about one team, which is the part that reads wrong when
 * it sits inline in the page.
 */
export function matches(candidate: CandidateGame, filter: Filter, query: string): boolean {
  if (filter === "ranked" && candidate.homeRank === null && candidate.awayRank === null) return false;
  if (filter === "sec" && candidate.homeConference !== "SEC" && candidate.awayConference !== "SEC") return false;
  if (query && !`${candidate.awayTeam} ${candidate.homeTeam}`.toLowerCase().includes(query.toLowerCase())) return false;
  return true;
}
