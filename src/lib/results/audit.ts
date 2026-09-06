/**
 * The result audit log: one row per commissioner change to a Game's result.
 * Kept apart from the results module so the slate module's `voidGame` can
 * log without importing the results module (which imports the slate).
 */
import "server-only";
import { resultAudits, type Game, type ResultAuditKind } from "@/db/schema";
import type { Db } from "@/db/types";

export type ResultStatus = "pending" | "final" | "void";

/** Where a final score came from. Null while pending or void. */
export type ResultSource = "feed" | "override";

/** The feed's running score while a Game is under way. Never counted; shown so a screen can. */
export interface LiveScore {
  homeScore: number;
  awayScore: number;
}

/** Every word a screen puts on a Game's state. One vocabulary, so the Reveal and the console agree. */
export type ResultLabel = "Scheduled" | "In progress" | "Final" | "Final · override" | "Void";

/**
 * A Game's result as scoring and screens see it: the Void first, then the
 * Result Override, then the feed. The whole answer, so no screen re-derives
 * part of it — `status`, `homeScore` and `awayScore` are what counts,
 * `live` is the running score that does not, and `label` is what to call it.
 */
export interface GameResult {
  status: ResultStatus;
  homeScore: number | null;
  awayScore: number | null;
  source: ResultSource | null;
  /** Set only while pending and under way. Null once final, void, or before kickoff. */
  live: LiveScore | null;
  label: ResultLabel;
}

export function effectiveResult(game: Game): GameResult {
  if (game.void) {
    return { status: "void", homeScore: null, awayScore: null, source: null, live: null, label: "Void" };
  }
  if (game.overrideHomeScore !== null && game.overrideAwayScore !== null) {
    return {
      status: "final",
      homeScore: game.overrideHomeScore,
      awayScore: game.overrideAwayScore,
      source: "override",
      live: null,
      label: "Final · override",
    };
  }
  // `games_final_has_scores` makes a final row without scores impossible; the
  // null checks are how TypeScript learns it.
  if (game.status === "final" && game.homeScore !== null && game.awayScore !== null) {
    return { status: "final", homeScore: game.homeScore, awayScore: game.awayScore, source: "feed", live: null, label: "Final" };
  }
  // The feed only reports in_progress with a score, so one condition settles
  // both the running score and the word for it.
  const live =
    game.status === "in_progress" && game.homeScore !== null && game.awayScore !== null
      ? { homeScore: game.homeScore, awayScore: game.awayScore }
      : null;
  return { status: "pending", homeScore: null, awayScore: null, source: null, live, label: live ? "In progress" : "Scheduled" };
}

/** "Oklahoma 24, Michigan 27", or "pending" / "void": the audit log reads without joins. */
export function describeResult(game: Game): string {
  const result = effectiveResult(game);
  if (result.status !== "final") return result.status;
  return `${game.awayTeam} ${result.awayScore}, ${game.homeTeam} ${result.homeScore}`;
}

export async function logResultChange(
  db: Db,
  actorId: number,
  kind: ResultAuditKind,
  before: Game,
  after: Game,
  note: string | null,
  at: Date,
): Promise<void> {
  await db.insert(resultAudits).values({
    gameId: after.id,
    kind,
    previousValue: describeResult(before),
    newValue: describeResult(after),
    note,
    changedBy: actorId,
    changedAt: at,
  });
}
