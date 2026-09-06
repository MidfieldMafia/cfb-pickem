import type { TeamDetail, Weather } from "@/lib/scoring/types";

/**
 * The extra per-game context the matchup panel needs, beyond what a published
 * slate carries. None of it is in the database: rank and record come from
 * /records, the stat bars from /stats/season, the win bar from
 * /metrics/wp/pregame, and the forecast from the paid /games/weather — all on
 * #32. Until that lands a caller passes null and the panel renders the spread
 * alone rather than empty bars.
 */
export interface MatchupDetail {
  /** Win probability for the home team, 0–1. */
  homeWp: number | null;
  weather: Weather | null;
  home: TeamDetail;
  away: TeamDetail;
}
