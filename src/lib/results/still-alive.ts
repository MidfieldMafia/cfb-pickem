/**
 * The still-alive mark (#590, design B of #587): before Week 13 kicks off, the
 * members who can still finish first in the season. Client-safe like `./json`,
 * which the Leaderboard table imports it beside.
 */
import type { Game } from "@/db/schema";
import { REGULAR_SEASON_FINAL_WEEK } from "@/lib/scoring";
import { effectiveResult } from "./result";

/** What the mark reads of a Leaderboard row: `LeaderboardRow` as the season graded it. */
export interface AliveRow {
  member: { id: number };
  totalPoints: number;
  /** False once the member has left the group: they keep a row, but are never marked. */
  active: boolean;
}

/** What the mark reads of a Week 13 Weekly Score. */
export interface AliveScore {
  member: { id: number };
  points: number;
  maxPoints: number;
}

export interface StillAlive {
  /** In board order. */
  alive: number[];
  /** One member is left: the label becomes "Clinched the title". */
  clinched: boolean;
}

/**
 * Who can still finish first. A member is alive when their season points plus
 * the most Week 13 can still add reach the leader's points; everyone tied for
 * first is alive, and the mark does not predict tiebreakers.
 *
 * - **The leader and the group** are the members still in it: one who has left
 *   is passed over for the title (`regularSeasonChampions`), so they are
 *   neither the points to catch nor one of the members "more than half" is
 *   counted of.
 * - **What is still to come** is `maxPoints - points`, since the member's
 *   season total already holds the Week's points so far. A member with no
 *   Weekly Score has nothing to come.
 * - Null, no mark, when more than half the group is alive (the mark would be
 *   on most rows and say little), or when nobody is in the group.
 */
export function stillAlive(season: readonly AliveRow[], week13: readonly AliveScore[]): StillAlive | null {
  const group = season.filter((row) => row.active);
  if (group.length === 0) return null;
  const toCome = new Map(week13.map((s) => [s.member.id, s.maxPoints - s.points]));
  const leader = Math.max(...group.map((row) => row.totalPoints));
  const alive = group
    .filter((row) => row.totalPoints + (toCome.get(row.member.id) ?? 0) >= leader)
    .map((row) => row.member.id);
  if (alive.length * 2 > group.length) return null;
  return { alive, clinched: alive.length === 1 };
}

/**
 * True on the published Slate of Week 13 while none of its games has kicked off
 * (Void ones set aside, as they never play): the only time the mark shows.
 * Read off each game's own result rather than the clock alone, so a game the
 * feed reports under way ahead of its kickoff time ends it too.
 */
export function beforeWeekKickoff(
  slate: { week: { weekNumber: number }; games: readonly Game[] } | null,
  now: Date,
): boolean {
  if (slate?.week.weekNumber !== REGULAR_SEASON_FINAL_WEEK) return false;
  const phases = slate.games.map((game) => effectiveResult(game, now).phase).filter((phase) => phase !== "void");
  return phases.length > 0 && phases.every((phase) => phase === "scheduled");
}
