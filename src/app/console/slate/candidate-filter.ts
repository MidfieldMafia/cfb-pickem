import type { CandidateGame } from "@/lib/cfbd/candidates";

/**
 * Each conference pill, keyed as it appears in `?filter=` and mapped to the
 * conference as CFBD spells it on a candidate, which is also the pill's label.
 */
const CONFERENCES = {
  sec: "SEC",
  "big-ten": "Big Ten",
  acc: "ACC",
  "big-12": "Big 12",
} as const;

type ConferenceFilter = keyof typeof CONFERENCES;

/** The pills a commissioner narrows the week's candidates with. */
export type Filter = "all" | "ranked" | ConferenceFilter;

export const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ranked", label: "Ranked" },
  ...Object.entries(CONFERENCES).map(([key, conference]) => ({ key: key as ConferenceFilter, label: conference })),
];

function isConference(filter: Filter): filter is ConferenceFilter {
  return filter in CONFERENCES;
}

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
 * either side is in that conference — a rule about the matchup rather than
 * about one team, which is the part that reads wrong when it sits inline in
 * the page. FBS-only is the
 * opposite shape: it hides a game unless *both* sides are classified `fbs`,
 * since a game with one FCS side is still a cupcake.
 */
export function matches(candidate: CandidateGame, filter: Filter, fbsOnly: boolean, query: string): boolean {
  if (fbsOnly && (candidate.homeClassification !== "fbs" || candidate.awayClassification !== "fbs")) return false;
  if (filter === "ranked" && candidate.homeRank === null && candidate.awayRank === null) return false;
  if (isConference(filter)) {
    const conference = CONFERENCES[filter];
    if (candidate.homeConference !== conference && candidate.awayConference !== conference) return false;
  }
  if (query && !`${candidate.awayTeam} ${candidate.homeTeam}`.toLowerCase().includes(query.toLowerCase())) return false;
  return true;
}
