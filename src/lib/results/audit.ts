/**
 * The result audit log: one row per commissioner change to a Game's result.
 * Kept apart from the results module so the slate module's `voidGame` can
 * log without importing the results module (which imports the slate).
 *
 * The derivation the log writes down — what a Game's result actually is —
 * lives in `result.ts`, which stays free of database imports so screens can
 * share it. This module is the half that writes rows.
 */
import "server-only";
import { resultAudits, type Game, type ResultAuditKind } from "@/db/schema";
import type { Db } from "@/db/types";
import { describeResult } from "./result";

export { describeResult, effectiveResult } from "./result";
export type { GameResult, ResultLabel, ResultSource, ResultStatus, Score } from "./result";

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
