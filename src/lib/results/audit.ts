/**
 * The result audit log: one row per commissioner change to a Game's result.
 * Kept apart from the results module so the slate module's `voidGame` can
 * log without importing the results module (which imports the slate).
 *
 * The derivation the log writes down — what a Game's result actually is —
 * lives in `result.ts`, which stays free of database imports so screens can
 * share it. This module is the half that writes rows, and it re-exported that
 * half for a while: `import "server-only"` on line one meant every caller that
 * took `effectiveResult` from here dragged a server-only module in with it, so
 * the db-free split bought nothing on the way through. Take the derivation from
 * `./result`; this module exports only what writes.
 */
import "server-only";
import { resultAudits, type Game, type ResultAuditKind } from "@/db/schema";
import type { Db } from "@/db/types";
import { describeResult } from "./result";

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
