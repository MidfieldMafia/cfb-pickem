import { standings } from "./score-season";
import type { LeaderboardRow, Member, SeasonResult } from "./types";

/**
 * The last regular-season Week: Week 13, fixed for 2026 (#586). Nothing else
 * marks it. `MAX_WEEK_NUMBER` stays 15, and the feed is read for the regular
 * season only, so the app has no other way to know which Week ends it.
 */
export const REGULAR_SEASON_FINAL_WEEK = 13;

/** A member who could be crowned: anyone graded, and whether they are still in the group. */
export interface ChampionCandidate extends Member {
  /** False once the member has left: they keep their row on the board but cannot be champion. */
  active: boolean;
}

/**
 * The Regular Season Champion (GLOSSARY.md): the member first on the season's
 * Leaderboard once Week 13 is settled, ties broken by the season tiebreak
 * (`compareSeason`). Empty until then.
 *
 * - **Settled** is the graded Week's `complete`, every non-void Game final,
 *   which is `results/engine.weekSettled` over the same effective results.
 * - **The board** is the one as it stood after Week 13, so a later Week's
 *   points, which carry on into the postseason, never move the title.
 * - **Who** is the top member still in the group: a leader who has left is
 *   passed over, with no minimum number of Played Weeks.
 * - **Co-champions** are every such member level with that one on every
 *   tiebreak, which is the shared rank.
 *
 * Computed on read, never stored, so a Result Override moves it like the
 * board. Each row is the champion's line on that Week 13 board, for the
 * points a screen shows.
 */
export function regularSeasonChampions(season: SeasonResult, members: readonly ChampionCandidate[]): LeaderboardRow[] {
  const final = season.weeks.find((w) => w.weekNumber === REGULAR_SEASON_FINAL_WEEK);
  if (!final?.complete) return [];
  const board = standings(
    season.weeks.filter((w) => w.weekNumber <= REGULAR_SEASON_FINAL_WEEK),
    [...members],
  );
  const stillIn = new Set(members.filter((m) => m.active).map((m) => m.id));
  const eligible = board.filter((row) => stillIn.has(row.memberId));
  if (eligible.length === 0) return [];
  return eligible.filter((row) => row.rank === eligible[0].rank);
}
