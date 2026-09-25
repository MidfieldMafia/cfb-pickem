/**
 * The bridge from database rows to the scoring engine's plain objects. The
 * engine never sees a Result Override or a Void flag's note: each Game goes
 * in with its effective result already applied, as the engine's contract
 * asks. Every screen that grades picks (the Reveal, week results, the
 * Leaderboard, the Live Board) builds its input here.
 */
import type { Game, Week } from "@/db/schema";
import type { RemovalPeriod } from "@/lib/groups/memberships";
import type { Entry } from "@/lib/picks/picks";
import { lockGameOf } from "@/lib/picks/progress";
import type * as engine from "@/lib/scoring/types";
import { effectiveResult } from "./result";

export function toEngineGame(game: Game): engine.Game {
  const result = effectiveResult(game);
  return {
    id: String(game.id),
    homeTeam: String(game.homeTeamId),
    awayTeam: String(game.awayTeamId),
    homeScore: result.homeScore,
    awayScore: result.awayScore,
    status: result.status === "final" ? "final" : result.live ? "in_progress" : "scheduled",
    void: result.status === "void",
  };
}

/** What the engine reads of one member's entry. */
export type EngineEntry = Pick<Entry<{ id: number }>, "member" | "picks" | "lock" | "tiebreakerGuess">;

/**
 * A published Week with everyone's picks, ready for `scoreWeek`. The Deadline
 * must be frozen (published). A Dropped Lock goes in on its game like any
 * other: the engine drops it itself, from the Void it is handed.
 */
export function toEngineWeek(week: Week, games: Game[], entries: readonly EngineEntry[]): engine.Week {
  if (!week.deadline) throw new Error("A week without a deadline cannot be scored.");
  return {
    weekNumber: week.weekNumber,
    deadline: week.deadline.toISOString(),
    published: week.published,
    tiebreakerGameId: week.tiebreakerGameId === null ? null : String(week.tiebreakerGameId),
    games: games.map(toEngineGame),
    picks: entries.flatMap((m) =>
      m.picks.map((p) => ({ memberId: String(m.member.id), gameId: String(p.gameId), team: String(p.teamId) })),
    ),
    locks: entries.flatMap((m) => {
      const gameId = lockGameOf(m.lock);
      return gameId === null ? [] : [{ memberId: String(m.member.id), gameId: String(gameId) }];
    }),
    tiebreakerGuesses: entries.flatMap((m) =>
      m.tiebreakerGuess === null ? [] : [{ memberId: String(m.member.id), guess: m.tiebreakerGuess }],
    ),
  };
}

/**
 * A member's standing in the group being scored: the *membership*, not the
 * person's row. `joinedAt` is when they joined this group, which is why a
 * `Member` row cannot be the parameter type any more — one person in two groups
 * crosses this bridge twice, same id, with a different date each time.
 *
 * A database `Member` still satisfies it structurally, which is deliberate: the
 * screens that have not been group-scoped yet keep compiling while they are
 * migrated one at a time.
 */
export interface GroupMember {
  id: number;
  /** The membership's joined-at for this group. */
  joinedAt: Date;
  /** Every period they were out of it. Absent for a member never removed. */
  removals?: readonly RemovalPeriod[];
}

export function toEngineMember(member: GroupMember): engine.Member {
  const crossing: engine.Member = { id: String(member.id), joinedAt: member.joinedAt.toISOString() };
  const absences = (member.removals ?? []).map(({ removedAt, restoredAt }) => ({
    from: removedAt.toISOString(),
    to: restoredAt === null ? null : restoredAt.toISOString(),
  }));
  // Omitted rather than empty, so `absences ?? []` inside the engine is the one
  // place the absence of one is spelled out.
  return absences.length === 0 ? crossing : { ...crossing, absences };
}
