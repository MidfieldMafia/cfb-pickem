/**
 * 1-based positions down an already sorted list: a row `compare` calls level
 * with the one above it shares that row's position, and the next one is
 * skipped, so a place is always "everyone strictly ahead, plus one". A Week's
 * places and the Leaderboard's ranks both count this way.
 */
export function sharedPositions<T>(sorted: readonly T[], compare: (a: T, b: T) => number): number[] {
  const positions: number[] = [];
  sorted.forEach((row, i) => {
    positions.push(i > 0 && compare(sorted[i - 1], row) === 0 ? positions[i - 1] : i + 1);
  });
  return positions;
}
