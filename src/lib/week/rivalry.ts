/**
 * The rivalry a Game is billed as while the Rivalry Week Look is on (#591):
 * its name ("Egg Bowl") and, when it has one, the trophy it is played for.
 * The games are hand-kept in `src/data/rivalries.json`, seeded from #584's
 * research, keyed by the two schools' names as the slate spells them.
 */
import rivalries from "@/data/rivalries.json";
import type { WeekLook } from "./look";

export interface Rivalry {
  name: string;
  /** The trophy the game is played for, or null when it has none (the Iron Bowl). */
  trophy: string | null;
}

/** The two schools as one key, whichever is at home. */
const pairKey = (a: string, b: string) => [a, b].sort().join("\n");

const BY_PAIR: ReadonlyMap<string, Rivalry> = new Map(
  rivalries.map((r) => [pairKey(r.home, r.away), { name: r.rivalry, trophy: r.trophy }]),
);

/**
 * The rivalry `game` is billed as under `look`, or null: for an ordinary game,
 * and for every game while the Look is off (`weekLook` answers null).
 */
export function rivalryOf(look: WeekLook | null, game: { awayTeam: string; homeTeam: string }): Rivalry | null {
  if (look !== "rivalry") return null;
  return BY_PAIR.get(pairKey(game.awayTeam, game.homeTeam)) ?? null;
}
