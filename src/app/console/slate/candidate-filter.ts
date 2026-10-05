import type { CandidateGame } from "@/lib/cfbd/candidates";

/** The pills a commissioner narrows the week's candidates with. */
export type Filter = "all" | "ranked" | ConferenceFilter;

type ConferenceFilter = "sec" | "big-ten" | "acc" | "big-12";

/** Each conference pill's conference, spelled as CFBD spells it on a candidate. */
const CONFERENCES: Record<ConferenceFilter, string> = {
  sec: "SEC",
  "big-ten": "Big Ten",
  acc: "ACC",
  "big-12": "Big 12",
};

export const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ranked", label: "Ranked" },
  { key: "sec", label: "SEC" },
  { key: "big-ten", label: "Big Ten" },
  { key: "acc", label: "ACC" },
  { key: "big-12", label: "Big 12" },
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
 * search box. Ranked means either side is ranked and a conference pill means
 * either side is in that conference — a rule about the matchup rather than about one team, which is the
 * part that reads wrong when it sits inline in the page. FBS-only is the
 * opposite shape: it hides a game unless *both* sides are classified `fbs`,
 * since a game with one FCS side is still a cupcake.
 */
export function matches(candidate: CandidateGame, filter: Filter, fbsOnly: boolean, query: string): boolean {
  if (fbsOnly && (candidate.homeClassification !== "fbs" || candidate.awayClassification !== "fbs")) return false;
  if (filter === "ranked" && candidate.homeRank === null && candidate.awayRank === null) return false;
  if (filter !== "all" && filter !== "ranked") {
    const conference = CONFERENCES[filter];
    if (candidate.homeConference !== conference && candidate.awayConference !== conference) return false;
  }
  if (query && !`${candidate.awayTeam} ${candidate.homeTeam}`.toLowerCase().includes(query.toLowerCase())) return false;
  return true;
}
