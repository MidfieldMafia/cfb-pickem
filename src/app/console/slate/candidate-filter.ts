import type { CandidateGame } from "@/lib/cfbd/candidates";

/** The three ways a commissioner narrows the week's candidates. */
export type Filter = "all" | "ranked" | "sec";

export const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ranked", label: "Ranked" },
  { key: "sec", label: "SEC" },
];

/** The `?filter=` a commissioner asked for, or "all" when it is missing or nonsense. */
export function filterParam(param: string | undefined): Filter {
  return FILTERS.some((f) => f.key === param) ? (param as Filter) : "all";
}

/**
 * The `?fbs=` a commissioner asked for. On by default: an absent or nonsense
 * param means filtered, the opposite of `filterParam`'s convention, because
 * the cupcakes are the exception a commissioner wants hidden, not an option
 * they have to opt into every week. Turning it off has to show up in the URL,
 * so the toggle writes an explicit "0" rather than removing the param.
 */
export function fbsOnlyParam(param: string | undefined): boolean {
  return param !== "0";
}

/**
 * Whether a feed candidate survives the pills, the FBS-only toggle, and the
 * search box. Ranked means either side is ranked and SEC means either side is
 * in it — a rule about the matchup rather than about one team, which is the
 * part that reads wrong when it sits inline in the page. FBS-only is the
 * opposite shape: it hides a game unless *both* sides are classified `fbs`,
 * since a game with one FCS side is still a cupcake.
 */
export function matches(candidate: CandidateGame, filter: Filter, fbsOnly: boolean, query: string): boolean {
  if (fbsOnly && (candidate.homeClassification !== "fbs" || candidate.awayClassification !== "fbs")) return false;
  if (filter === "ranked" && candidate.homeRank === null && candidate.awayRank === null) return false;
  if (filter === "sec" && candidate.homeConference !== "SEC" && candidate.awayConference !== "SEC") return false;
  if (query && !`${candidate.awayTeam} ${candidate.homeTeam}`.toLowerCase().includes(query.toLowerCase())) return false;
  return true;
}
