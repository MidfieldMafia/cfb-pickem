import { hourIn } from "@/lib/intl-time";

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
  const hour = hourIn(kickoff, "America/New_York");
  if (hour < 14) return "Noon";
  if (hour < 18) return "Afternoon";
  return "Night";
}

/** Groups games by exact kickoff, earliest first, preserving slate order within a window. */
export function groupByKickoff<T extends { game: { kickoff: string } }>(
  games: T[],
): { kickoff: string; games: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const view of games) {
    const { kickoff } = view.game;
    const existing = groups.get(kickoff);
    if (existing) existing.push(view);
    else groups.set(kickoff, [view]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kickoff, inWindow]) => ({ kickoff, games: inWindow }));
}
