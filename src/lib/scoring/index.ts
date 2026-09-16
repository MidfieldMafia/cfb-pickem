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
 * they joined and they made at least one Pick on it. Those are two different
 * questions and `scoreWeek` answers both: everyone who joined in time gets a
 * Weekly Score, so a week's own screens can show a member who sat it out at
 * zero, and each score carries `played` so `scoreSeason` can ignore the ones
 * that do not count. A skipped week touches no total, average or tiebreak.
 *
 * Callers pass only the weeks they want counted. A published week whose
 * Deadline has not passed yet is already a played week for everyone who has
 * picked in it, at whatever those picks have scored so far, so pass it only
 * once the Deadline is behind the server clock.
 */
export { scoreWeek } from "./score-week";
export { scoreSeason } from "./score-season";
