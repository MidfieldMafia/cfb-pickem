/**
 * Review groups picks by kickoff window. Windows are an Eastern-time
 * convention in college football — a Central viewer still calls the 11am
 * kickoff a noon game — so the bucket is computed in ET regardless of where
 * the viewer is, while the time beside it renders in their own zone.
 *
 * The design named the middle slot "3:30"; this generalizes it so an arbitrary
 * slate still groups sensibly.
 */
export function windowLabel(kickoff: string | Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" }).format(
      new Date(kickoff),
    ),
  );
  if (hour < 14) return "Noon";
  if (hour < 18) return "Afternoon";
  return "Night";
}

/** Groups games by exact kickoff, earliest first, preserving slate order within a window. */
export function groupByKickoff<T extends { kickoff: string }>(games: T[]): { kickoff: string; games: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const game of games) {
    const existing = groups.get(game.kickoff);
    if (existing) existing.push(game);
    else groups.set(game.kickoff, [game]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kickoff, inWindow]) => ({ kickoff, games: inWindow }));
}
