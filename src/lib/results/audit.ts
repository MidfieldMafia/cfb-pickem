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

/** A Game's result as scoring and screens see it: the Void first, then the Result Override, then the feed. */
export interface GameResult {
  status: ResultStatus;
  homeScore: number | null;
  awayScore: number | null;
  source: ResultSource | null;
}

export function effectiveResult(game: Game): GameResult {
  if (game.void) return { status: "void", homeScore: null, awayScore: null, source: null };
  if (game.overrideHomeScore !== null && game.overrideAwayScore !== null) {
    return { status: "final", homeScore: game.overrideHomeScore, awayScore: game.overrideAwayScore, source: "override" };
  }
  if (game.status === "final" && game.homeScore !== null && game.awayScore !== null) {
    return { status: "final", homeScore: game.homeScore, awayScore: game.awayScore, source: "feed" };
  }
  return { status: "pending", homeScore: null, awayScore: null, source: null };
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
