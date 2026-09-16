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
 * A week counts for a member — a Played Week — when its Deadline fell after
 * they joined and they made at least one Pick on it. A week they sat out is
 * absent from their scores entirely rather than present at zero, so it touches
 * no total, no average and no tiebreak.
 *
 * Callers pass only the weeks they want counted. A published week whose
 * Deadline has not passed yet is already a played week for everyone who has
 * picked in it, at whatever those picks have scored so far, so pass it only
 * once the Deadline is behind the server clock.
 */
export { scoreWeek } from "./score-week";
export { scoreSeason } from "./score-season";
