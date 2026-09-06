/**
 * The bridge from database rows to the scoring engine's plain objects. The
 * engine never sees a Result Override or a Void flag's note: each Game goes
 * in with its effective result already applied, as the engine's contract
 * asks. Every screen that grades picks (the Reveal, week results, the
 * Leaderboard, the Live Board) builds its input here.
 */
import type { Game, Member, Week } from "@/db/schema";
import type { MemberPicks } from "@/lib/picks/picks";
import type * as engine from "@/lib/scoring/types";
import { effectiveResult } from "./audit";

export function toEngineGame(game: Game): engine.Game {
  const result = effectiveResult(game);
  return {
    id: String(game.id),
    homeTeam: String(game.homeTeamId),
    awayTeam: String(game.awayTeamId),
    homeScore: result.homeScore,
    awayScore: result.awayScore,
    status: result.status === "final" ? "final" : game.status === "final" ? "scheduled" : game.status,
    void: result.status === "void",
  };
}

/** A published Week with everyone's picks, ready for `scoreWeek`. The Deadline must be frozen (published). */
export function toEngineWeek(week: Week, games: Game[], memberPicks: MemberPicks[]): engine.Week {
  if (!week.deadline) throw new Error("A week without a deadline cannot be scored.");
  return {
    weekNumber: week.weekNumber,
    deadline: week.deadline.toISOString(),
    published: week.published,
    tiebreakerGameId: week.tiebreakerGameId === null ? null : String(week.tiebreakerGameId),
    games: games.map(toEngineGame),
    picks: memberPicks.flatMap((m) =>
      m.picks.map((p) => ({ memberId: String(m.memberId), gameId: String(p.gameId), team: String(p.teamId) })),
    ),
    locks: memberPicks.flatMap((m) =>
      m.lockGameId === null ? [] : [{ memberId: String(m.memberId), gameId: String(m.lockGameId) }],
    ),
    tiebreakerGuesses: memberPicks.flatMap((m) =>
      m.tiebreakerGuess === null ? [] : [{ memberId: String(m.memberId), guess: m.tiebreakerGuess }],
    ),
  };
}

export function toEngineMember(member: Pick<Member, "id" | "joinedAt">): engine.Member {
  return { id: String(member.id), joinedAt: member.joinedAt.toISOString() };
}
