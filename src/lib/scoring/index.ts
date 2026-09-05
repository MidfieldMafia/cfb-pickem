/**
 * Saturday Slate scoring engine.
 *
 * Pure functions over plain objects. No framework, database, or clock
 * imports. Every screen computes standings on read by calling these.
 *
 * - `scoreWeek` grades one week: per-member Weekly Scores with a per-pick
 *   breakdown and the Weekly Win.
 * - `scoreSeason` grades every published week and builds the Leaderboard.
 *
 * Callers pass only the weeks they want counted. A published week whose
 * Deadline has not passed yet counts as a played week with zero points,
 * so pass it only once the Deadline is behind the server clock.
 */
export { scoreWeek, playedWeek } from "./score-week";
export { scoreSeason } from "./score-season";
export type * from "./types";
