import type { LeaderboardRow } from "@/lib/results/results";
import { winRate } from "@/lib/results/summary";

/** The four Leaderboard columns a member can tap to sort by. */
export type SortColumn = "points" | "winRate" | "wins" | "miss";

/**
 * `asc` is each column's own best-first order (highest Pts, highest Win%,
 * most Wins, lowest Miss) — the same convention as
 * `src/app/console/slate/candidate-sort.ts`'s `asc`, not literal numeric
 * ascending. `desc` reverses it.
 */
export type SortDirection = "asc" | "desc";

/** Whether a row has no real value to sort by on the given column: no graded pick yet, or no Tiebreaker Guess to average. */
function isDashed(row: LeaderboardRow, column: SortColumn): boolean {
  if (column === "winRate") return winRate(row.correct, row.incorrect) === null;
  if (column === "miss") return row.averageTiebreakerMiss === null;
  return false;
}

function compare(a: LeaderboardRow, b: LeaderboardRow, column: SortColumn): number {
  if (column === "points") return b.totalPoints - a.totalPoints;
  if (column === "winRate") return winRate(b.correct, b.incorrect)! - winRate(a.correct, a.incorrect)!;
  if (column === "wins") return b.weeklyWins - a.weeklyWins;
  // Miss reads lower-is-better, so its own best-first order is ascending, unlike every other column.
  return a.averageTiebreakerMiss! - b.averageTiebreakerMiss!;
}

/**
 * Orders rows best-first (or reversed) by the given column. Dash rows sink to
 * the bottom regardless of direction, as `candidate-sort.ts`'s `sortCandidates`
 * does for an unplaced game: they are carved out before the sort/reverse and
 * appended afterward, since a missing value isn't a point in the order that
 * flipping direction should move.
 */
export function sortLeaderboard(
  rows: LeaderboardRow[],
  column: SortColumn,
  direction: SortDirection,
): LeaderboardRow[] {
  const placed: LeaderboardRow[] = [];
  const dashed: LeaderboardRow[] = [];
  for (const row of rows) (isDashed(row, column) ? dashed : placed).push(row);

  placed.sort((a, b) => compare(a, b, column));
  if (direction === "desc") placed.reverse();

  return [...placed, ...dashed];
}
