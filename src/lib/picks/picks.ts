/**
 * Pick entry: a Member's Picks, Lock of the Week, and Tiebreaker Guess for
 * a Week. Vocabulary follows CONTEXT.md. Every function takes the database
 * first and the acting member second; `now` is the server clock, injected so
 * tests can sit on either side of the Deadline.
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  games,
  locks,
  members,
  picks,
  tiebreakerGuesses,
  weeks,
  type Game,
  type Member,
  type Season,
  type Week,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { slateFor } from "@/lib/slate/slate";
import { MAX_TIEBREAKER_GUESS } from "./limits";

export class InvalidPick extends Error {}

/** The highest combined score the guess field accepts. The record is 145; nobody needs more. */
export { MAX_TIEBREAKER_GUESS };

/** Thrown for any pick, lock, or guess change at or after the Deadline. */
export class DeadlinePassed extends InvalidPick {
  constructor() {
    super("Picks are locked: the deadline has passed.");
  }
}

/** Thrown when anyone asks for other members' picks before the Deadline. */
export class PicksHidden extends Error {
  constructor() {
    super("Picks stay hidden until the deadline.");
  }
}

export interface PickRow {
  gameId: number;
  teamId: number;
  updatedAt: Date;
}

/** Everything the pick flow and review screen need for one member and one Week. */
export interface PickSheet {
  week: Week;
  season: Season;
  /** In kickoff order, the same order the flow walks. */
  games: Game[];
  deadline: Date;
  /** The member's own picks, in slate order. Unpicked games have no entry. */
  picks: PickRow[];
  /** The Game carrying the Lock of the Week, or null. */
  lockGameId: number | null;
  tiebreakerGuess: number | null;
  /** The server clock at read time, for countdowns. */
  serverNow: Date;
  /** True once `serverNow` reaches the Deadline. */
  locked: boolean;
}

function isLocked(deadline: Date, now: Date): boolean {
  return now.getTime() >= deadline.getTime();
}

/** A Week members can pick in: published, so its Deadline is frozen. */
async function openForPicks(db: Db, weekId: number, now: Date): Promise<Week> {
  const week = await db.query.weeks.findFirst({ where: eq(weeks.id, weekId) });
  if (!week || !week.published || !week.deadline) throw new InvalidPick("That week is not published.");
  if (isLocked(week.deadline, now)) throw new DeadlinePassed();
  return week;
}

async function loadGame(db: Db, gameId: number): Promise<Game & { week: Week }> {
  const game = await db.query.games.findFirst({ where: eq(games.id, gameId), with: { week: true } });
  if (!game) throw new InvalidPick("That game is not on the slate.");
  return game;
}

export async function pickSheet(db: Db, actor: Member, weekId: number, now: Date = new Date()): Promise<PickSheet> {
  const slate = await slateFor(db, weekId);
  if (!slate.week.published || !slate.week.deadline) throw new InvalidPick("That week is not published.");
  const gameIds = slate.games.map((g) => g.id);
  const [rows, lock, guess] = await Promise.all([
    gameIds.length
      ? db.query.picks.findMany({ where: and(eq(picks.memberId, actor.id), inArray(picks.gameId, gameIds)) })
      : [],
    db.query.locks.findFirst({ where: and(eq(locks.memberId, actor.id), eq(locks.weekId, weekId)) }),
    db.query.tiebreakerGuesses.findFirst({
      where: and(eq(tiebreakerGuesses.memberId, actor.id), eq(tiebreakerGuesses.weekId, weekId)),
    }),
  ]);
  const byGame = new Map(rows.map((r) => [r.gameId, r]));
  const own: PickRow[] = [];
  for (const game of slate.games) {
    const row = byGame.get(game.id);
    if (row) own.push({ gameId: row.gameId, teamId: row.teamId, updatedAt: row.updatedAt });
  }
  return {
    week: slate.week,
    season: slate.season,
    games: slate.games,
    deadline: slate.week.deadline,
    picks: own,
    lockGameId: lock?.gameId ?? null,
    tiebreakerGuess: guess?.guess ?? null,
    serverNow: now,
    locked: isLocked(slate.week.deadline, now),
  };
}

/** One member's picks as they stand at the Reveal. */
export interface MemberPicks {
  memberId: number;
  picks: PickRow[];
  lockGameId: number | null;
  tiebreakerGuess: number | null;
}

/**
 * The Reveal: every member's picks for a Week. Refused before the Deadline
 * for everyone, commissioners included; a member's own picks come from
 * `pickSheet`, which is never hidden from them.
 */
export async function weekPicks(db: Db, _actor: Member, weekId: number, now: Date = new Date()): Promise<MemberPicks[]> {
  const slate = await slateFor(db, weekId);
  if (!slate.week.published || !slate.week.deadline) throw new InvalidPick("That week is not published.");
  if (!isLocked(slate.week.deadline, now)) throw new PicksHidden();
  const gameIds = slate.games.map((g) => g.id);
  const [activeMembers, rows, lockRows, guessRows] = await Promise.all([
    db.query.members.findMany({ where: eq(members.active, true) }),
    gameIds.length ? db.query.picks.findMany({ where: inArray(picks.gameId, gameIds) }) : [],
    db.query.locks.findMany({ where: eq(locks.weekId, weekId) }),
    db.query.tiebreakerGuesses.findMany({ where: eq(tiebreakerGuesses.weekId, weekId) }),
  ]);
  const order = new Map(gameIds.map((id, i) => [id, i]));
  // Every active member is on the board, picks or none: a blank week is a row, not an absence.
  const byMember = new Map<number, MemberPicks>(
    activeMembers.map((m) => [m.id, { memberId: m.id, picks: [], lockGameId: null, tiebreakerGuess: null }]),
  );
  const entry = (memberId: number) => {
    let m = byMember.get(memberId);
    if (!m) {
      m = { memberId, picks: [], lockGameId: null, tiebreakerGuess: null };
      byMember.set(memberId, m);
    }
    return m;
  };
  for (const r of rows) entry(r.memberId).picks.push({ gameId: r.gameId, teamId: r.teamId, updatedAt: r.updatedAt });
  for (const l of lockRows) entry(l.memberId).lockGameId = l.gameId;
  for (const g of guessRows) entry(g.memberId).tiebreakerGuess = g.guess;
  for (const m of byMember.values()) m.picks.sort((a, b) => order.get(a.gameId)! - order.get(b.gameId)!);
  return [...byMember.values()].sort((a, b) => a.memberId - b.memberId);
}

/** Saves or replaces the member's Pick for one Game. Saved the moment it is tapped; there is no submit step. */
export async function savePick(
  db: Db,
  actor: Member,
  weekId: number,
  gameId: number,
  teamId: number,
  now: Date = new Date(),
): Promise<PickRow> {
  const game = await loadGame(db, gameId);
  if (game.weekId !== weekId) throw new InvalidPick("That game is not on this week's slate.");
  await openForPicks(db, weekId, now);
  if (game.void) throw new InvalidPick("That game is void; it scores zero for everyone.");
  if (teamId !== game.homeTeamId && teamId !== game.awayTeamId) {
    throw new InvalidPick("Pick one of the two teams in the game.");
  }
  const [row] = await db
    .insert(picks)
    .values({ memberId: actor.id, gameId, teamId, updatedAt: now, updatedBy: actor.id })
    .onConflictDoUpdate({
      target: [picks.memberId, picks.gameId],
      set: { teamId, updatedAt: now, updatedBy: actor.id },
    })
    .returning();
  return { gameId: row.gameId, teamId: row.teamId, updatedAt: row.updatedAt };
}

/** Marks one Game as the Lock of the Week, replacing any earlier Lock; null clears it. */
export async function setLock(
  db: Db,
  actor: Member,
  weekId: number,
  gameId: number | null,
  now: Date = new Date(),
): Promise<void> {
  await openForPicks(db, weekId, now);
  if (gameId === null) {
    await db.delete(locks).where(and(eq(locks.memberId, actor.id), eq(locks.weekId, weekId)));
    return;
  }
  const game = await loadGame(db, gameId);
  if (game.weekId !== weekId) throw new InvalidPick("That game is not on this week's slate.");
  if (game.void) throw new InvalidPick("That game is void; it cannot be the Lock of the Week.");
  const pick = await db.query.picks.findFirst({ where: and(eq(picks.memberId, actor.id), eq(picks.gameId, gameId)) });
  if (!pick) throw new InvalidPick("Pick a winner in that game before locking it.");
  await db
    .insert(locks)
    .values({ memberId: actor.id, weekId, gameId, updatedAt: now, updatedBy: actor.id })
    .onConflictDoUpdate({ target: [locks.memberId, locks.weekId], set: { gameId, updatedAt: now, updatedBy: actor.id } });
}

/** Records the member's predicted combined final score of the Tiebreaker Game. */
export async function setTiebreakerGuess(
  db: Db,
  actor: Member,
  weekId: number,
  guess: number,
  now: Date = new Date(),
): Promise<void> {
  await openForPicks(db, weekId, now);
  if (!Number.isInteger(guess) || guess < 0 || guess > MAX_TIEBREAKER_GUESS) {
    throw new InvalidPick(`The guess is a whole number of points, 0 to ${MAX_TIEBREAKER_GUESS}.`);
  }
  await db
    .insert(tiebreakerGuesses)
    .values({ memberId: actor.id, weekId, guess, updatedAt: now, updatedBy: actor.id })
    .onConflictDoUpdate({
      target: [tiebreakerGuesses.memberId, tiebreakerGuesses.weekId],
      set: { guess, updatedAt: now, updatedBy: actor.id },
    });
}
