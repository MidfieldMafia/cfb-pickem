/**
 * The one writer for a pick edit. A Pick, a Lock of the Week, and a
 * Tiebreaker Guess are three shapes of the same thing — a change to one
 * member's sheet for one Week — and `applyEdit` is the only way any of them
 * reaches the database, from the phone or from the console.
 *
 * What differs between the two callers is the `Authority` it is given, and
 * nothing else: the Deadline binds a member and not a commissioner, and a
 * commissioner's edit is always audited. Every other rule — the game is on
 * this slate, a void game takes no pick and no Lock, a Lock needs a pick
 * under it — runs the same either way, which is the point.
 *
 * The Slate comes from the caller, already loaded. Vocabulary follows
 * CONTEXT.md; `now` is the server clock, injected so tests can sit on either
 * side of the Deadline.
 */
import "server-only";
import { and, eq } from "drizzle-orm";
import { locks, pickAudits, picks, tiebreakerGuesses, type Game, type PickAuditKind } from "@/db/schema";
import type { Db } from "@/db/types";
import { subjectOf, type Authority } from "@/lib/members/authority";
import { teamName } from "@/lib/slate/json";
import { deadlinePassed, type Slate } from "@/lib/slate/slate";
import { tiebreakerGuessError } from "./limits";
import { DeadlinePassed, InvalidPick, pickSheet, publishedDeadline, type PickSheet } from "./picks";

/** The one shape a change to a member's sheet takes. */
export type PickEdit =
  | { kind: "pick"; gameId: number; teamId: number }
  | { kind: "lock"; gameId: number | null }
  | { kind: "guess"; guess: number | null };

/**
 * One Game off the Slate the caller is holding. The writers used to re-read
 * the Game and the Week from a `weekId` the caller had just read them from;
 * taking the Slate is what removes that second read, and "on this slate" is
 * the same check either way.
 */
function gameOnSlate(slate: Slate, gameId: number): Game {
  const game = slate.games.find((g) => g.id === gameId);
  if (!game) throw new InvalidPick("That game is not on the slate.");
  return game;
}

/**
 * A commissioner's edit on the record. The `iff` from this module's contract
 * lives here, in one statement: a member's own edit passes through and writes
 * nothing, so no caller decides whether an override is audited.
 */
async function logPickChange(
  db: Db,
  by: Authority,
  weekId: number,
  gameId: number | null,
  kind: PickAuditKind,
  change: { previousValue: string | null; newValue: string | null; at: Date },
): Promise<void> {
  if (by.as !== "commissioner") return;
  await db.insert(pickAudits).values({
    memberId: by.memberId,
    weekId,
    gameId,
    kind,
    previousValue: change.previousValue,
    newValue: change.newValue,
    changedBy: by.actor.id,
    changedAt: change.at,
  });
}

/**
 * Applies one edit and hands back the sheet it produced, so a caller that
 * has to show the result — every PUT route — does not read it again.
 */
export async function applyEdit(
  db: Db,
  by: Authority,
  slate: Slate,
  edit: PickEdit,
  now: Date = new Date(),
): Promise<PickSheet> {
  publishedDeadline(slate.week);
  // The one place the Deadline is enforced, and the one condition under which it is.
  if (by.as === "member" && deadlinePassed(slate.week, now)) throw new DeadlinePassed();
  const memberId = subjectOf(by);

  switch (edit.kind) {
    case "pick":
      await writePick(db, by, slate, memberId, edit, now);
      break;
    case "lock":
      await writeLock(db, by, slate, memberId, edit, now);
      break;
    case "guess":
      await writeGuess(db, by, slate, memberId, edit, now);
      break;
  }

  return pickSheet(db, { id: memberId }, slate, now);
}

async function writePick(
  db: Db,
  by: Authority,
  slate: Slate,
  memberId: number,
  edit: Extract<PickEdit, { kind: "pick" }>,
  now: Date,
): Promise<void> {
  const game = gameOnSlate(slate, edit.gameId);
  if (game.void) throw new InvalidPick("That game is void; it scores zero for everyone.");
  if (edit.teamId !== game.homeTeamId && edit.teamId !== game.awayTeamId) {
    throw new InvalidPick("Pick one of the two teams in the game.");
  }
  // Only an audited edit needs to name what it replaced, so only that path pays for the read.
  const before = by.as === "commissioner" ? await ownPick(db, memberId, edit.gameId) : undefined;
  await db
    .insert(picks)
    .values({ memberId, gameId: edit.gameId, teamId: edit.teamId, updatedAt: now, updatedBy: by.actor.id })
    .onConflictDoUpdate({
      target: [picks.memberId, picks.gameId],
      set: { teamId: edit.teamId, updatedAt: now, updatedBy: by.actor.id },
    });
  await logPickChange(db, by, slate.week.id, edit.gameId, "pick", {
    previousValue: before ? teamName(game, before.teamId) : null,
    newValue: teamName(game, edit.teamId),
    at: now,
  });
}

async function writeLock(
  db: Db,
  by: Authority,
  slate: Slate,
  memberId: number,
  edit: Extract<PickEdit, { kind: "lock" }>,
  now: Date,
): Promise<void> {
  const weekId = slate.week.id;
  const before = by.as === "commissioner" ? await ownLock(db, memberId, weekId) : undefined;
  let newValue: string | null = null;
  if (edit.gameId === null) {
    await db.delete(locks).where(and(eq(locks.memberId, memberId), eq(locks.weekId, weekId)));
  } else {
    const game = gameOnSlate(slate, edit.gameId);
    if (game.void) throw new InvalidPick("That game is void; it cannot be the Lock of the Week.");
    const pick = await ownPick(db, memberId, edit.gameId);
    if (!pick) throw new InvalidPick("Pick a winner in that game before locking it.");
    // The pick is in hand, so the new Lock names itself without a second read.
    newValue = teamName(game, pick.teamId);
    await db
      .insert(locks)
      .values({ memberId, weekId, gameId: edit.gameId, updatedAt: now, updatedBy: by.actor.id })
      .onConflictDoUpdate({
        target: [locks.memberId, locks.weekId],
        set: { gameId: edit.gameId, updatedAt: now, updatedBy: by.actor.id },
      });
  }
  await logPickChange(db, by, weekId, edit.gameId ?? before?.gameId ?? null, "lock", {
    previousValue: before ? await lockName(db, memberId, gameOnSlate(slate, before.gameId)) : null,
    newValue,
    at: now,
  });
}

async function writeGuess(
  db: Db,
  by: Authority,
  slate: Slate,
  memberId: number,
  edit: Extract<PickEdit, { kind: "guess" }>,
  now: Date,
): Promise<void> {
  const weekId = slate.week.id;
  const before = by.as === "commissioner" ? await ownGuess(db, memberId, weekId) : undefined;
  if (edit.guess === null) {
    await db
      .delete(tiebreakerGuesses)
      .where(and(eq(tiebreakerGuesses.memberId, memberId), eq(tiebreakerGuesses.weekId, weekId)));
  } else {
    const invalid = tiebreakerGuessError(edit.guess);
    if (invalid) throw new InvalidPick(invalid);
    await db
      .insert(tiebreakerGuesses)
      .values({ memberId, weekId, guess: edit.guess, updatedAt: now, updatedBy: by.actor.id })
      .onConflictDoUpdate({
        target: [tiebreakerGuesses.memberId, tiebreakerGuesses.weekId],
        set: { guess: edit.guess, updatedAt: now, updatedBy: by.actor.id },
      });
  }
  // A Guess belongs to the Week, not to a Game, so the audit row carries no game.
  await logPickChange(db, by, weekId, null, "tiebreaker_guess", {
    previousValue: before ? String(before.guess) : null,
    newValue: edit.guess === null ? null : String(edit.guess),
    at: now,
  });
}

function ownPick(db: Db, memberId: number, gameId: number) {
  return db.query.picks.findFirst({ where: and(eq(picks.memberId, memberId), eq(picks.gameId, gameId)) });
}

function ownLock(db: Db, memberId: number, weekId: number) {
  return db.query.locks.findFirst({ where: and(eq(locks.memberId, memberId), eq(locks.weekId, weekId)) });
}

function ownGuess(db: Db, memberId: number, weekId: number) {
  return db.query.tiebreakerGuesses.findFirst({
    where: and(eq(tiebreakerGuesses.memberId, memberId), eq(tiebreakerGuesses.weekId, weekId)),
  });
}

/** A Lock reads as the team the member locked, so the audit log shows it without a join. */
async function lockName(db: Db, memberId: number, game: Game): Promise<string> {
  const pick = await ownPick(db, memberId, game.id);
  return pick ? teamName(game, pick.teamId) : `${game.awayTeam} at ${game.homeTeam}`;
}
