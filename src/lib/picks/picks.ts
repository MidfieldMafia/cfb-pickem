/**
 * Pick entry: a Member's Picks, Lock of the Week, and Tiebreaker Guess for
 * a Week. Vocabulary follows CONTEXT.md. Every function takes the database
 * first and the acting member second; `now` is the server clock, injected so
 * tests can sit on either side of the Deadline.
 */
import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import {
  games,
  locks,
  picks,
  tiebreakerGuesses,
  weeks,
  type Game,
  type Member,
  type Season,
  type Week,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { roster } from "@/lib/members/roster";
import { toGameView } from "@/lib/slate/json";
import { deadlinePassed, type Slate } from "@/lib/slate/slate";
import { tiebreakerGuessError } from "./limits";
import { sheetProgress, type SheetProgress } from "./progress";

export class InvalidPick extends Error {}

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
  /** The Game carrying the Lock of the Week, or null. May be a Void game — see `lockDropped`. */
  lockGameId: number | null;
  /**
   * True when the Lock sits on a Void game: a Dropped Lock. It scores nothing,
   * and before the Deadline the member may move it to another game. Derived
   * here so the screens read one field instead of each re-deriving it.
   */
  lockDropped: boolean;
  tiebreakerGuess: number | null;
  /**
   * What is left before the Deadline, counted here so no screen counts it
   * again. This is the server's count at read time; a screen holding a change
   * the server has not answered yet recounts with `sheetProgress`.
   */
  progress: SheetProgress;
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

/**
 * One member's sheet for a Slate the caller already loaded. Taking the Slate
 * rather than a week id is what lets a screen read the Week once and hand the
 * same rows to the sheet, the Reveal, and the score refresh.
 */
export async function pickSheet(db: Db, actor: Member, slate: Slate, now: Date = new Date()): Promise<PickSheet> {
  if (!slate.week.published || !slate.week.deadline) throw new InvalidPick("That week is not published.");
  const weekId = slate.week.id;
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
  const lockGameId = lock?.gameId ?? null;
  const lockDropped = slate.games.some((g) => g.id === lockGameId && g.void);
  const tiebreakerGuess = guess?.guess ?? null;
  return {
    week: slate.week,
    season: slate.season,
    games: slate.games,
    deadline: slate.week.deadline,
    picks: own,
    lockGameId,
    lockDropped,
    tiebreakerGuess,
    progress: sheetProgress({
      games: slate.games.map(toGameView),
      picked: (gameId) => byGame.has(gameId),
      lockGameId,
      lockDropped,
      tiebreakerGuess,
    }),
    serverNow: now,
    locked: deadlinePassed(slate, now),
  };
}

/** One member's picks as they stand at the Reveal. */
export interface MemberPicks {
  memberId: number;
  picks: PickRow[];
  lockGameId: number | null;
  tiebreakerGuess: number | null;
}

type PickTable = typeof picks.$inferSelect;
type LockTable = typeof locks.$inferSelect;
type GuessTable = typeof tiebreakerGuesses.$inferSelect;

/**
 * One Week's rows folded into a `MemberPicks` per member, picks in slate
 * order. Shared by `weekPicks` and `seasonPicks` so one Week and a whole
 * season cannot disagree about what a blank week looks like.
 *
 * The board is `roster`'s to decide and is passed in whole: a row belonging to
 * nobody on it is dropped here rather than quietly conjuring a member, which
 * is how a deactivated member used to reach the Reveal — as a side effect of a
 * failed map lookup rather than as anyone's decision.
 */
function groupPicks(
  board: Pick<Member, "id">[],
  gameIds: number[],
  rows: PickTable[],
  lockRows: LockTable[],
  guessRows: GuessTable[],
): MemberPicks[] {
  const order = new Map(gameIds.map((id, i) => [id, i]));
  // Every member on the board gets a row, picks or none: a blank week is a row, not an absence.
  const byMember = new Map<number, MemberPicks>(
    board.map((m) => [m.id, { memberId: m.id, picks: [], lockGameId: null, tiebreakerGuess: null }]),
  );
  for (const r of rows) byMember.get(r.memberId)?.picks.push({ gameId: r.gameId, teamId: r.teamId, updatedAt: r.updatedAt });
  for (const l of lockRows) {
    const m = byMember.get(l.memberId);
    if (m) m.lockGameId = l.gameId;
  }
  for (const g of guessRows) {
    const m = byMember.get(g.memberId);
    if (m) m.tiebreakerGuess = g.guess;
  }
  for (const m of byMember.values()) m.picks.sort((a, b) => order.get(a.gameId)! - order.get(b.gameId)!);
  return [...byMember.values()].sort((a, b) => a.memberId - b.memberId);
}

/** The members with a Pick, a Lock, or a Guess on a Week: `roster`'s widening for anyone since deactivated. */
function pickers(rows: PickTable[], lockRows: LockTable[], guessRows: GuessTable[]): Set<number> {
  const ids = new Set<number>();
  for (const r of rows) ids.add(r.memberId);
  for (const l of lockRows) ids.add(l.memberId);
  for (const g of guessRows) ids.add(g.memberId);
  return ids;
}

/**
 * The Reveal: every member's picks for a Week. Refused before the Deadline
 * for everyone, commissioners included; a member's own picks come from
 * `pickSheet`, which is never hidden from them.
 *
 * Who is on the board is `roster`'s answer, the same one the console table and
 * the scoring path read.
 */
export async function weekPicks(db: Db, _actor: Member, slate: Slate, now: Date = new Date()): Promise<MemberPicks[]> {
  if (!slate.week.published || !slate.week.deadline) throw new InvalidPick("That week is not published.");
  if (!deadlinePassed(slate, now)) throw new PicksHidden();
  const weekId = slate.week.id;
  const gameIds = slate.games.map((g) => g.id);
  const [everyone, rows, lockRows, guessRows] = await Promise.all([
    db.query.members.findMany(),
    gameIds.length ? db.query.picks.findMany({ where: inArray(picks.gameId, gameIds) }) : [],
    db.query.locks.findMany({ where: eq(locks.weekId, weekId) }),
    db.query.tiebreakerGuesses.findMany({ where: eq(tiebreakerGuesses.weekId, weekId) }),
  ]);
  const board = roster(everyone, slate.week, pickers(rows, lockRows, guessRows));
  return groupPicks(board, gameIds, rows, lockRows, guessRows);
}

/** A Week with its Games in slate order: what `seasonPicks` needs to fold one Week's rows. */
export interface WeekGames {
  week: Week;
  games: Game[];
}

/**
 * Every member's picks for several Weeks at once, keyed by week id. Four
 * reads for the whole season rather than four per Week: the Leaderboard
 * grades every played Week on read, and the round trips, not the arithmetic,
 * are what that costs. Refused for a Week still open, exactly as `weekPicks`
 * is — reading a season is not a way around the Deadline.
 */
export async function seasonPicks(
  db: Db,
  weekGames: WeekGames[],
  now: Date = new Date(),
): Promise<Map<number, MemberPicks[]>> {
  for (const { week } of weekGames) {
    if (!week.published || !week.deadline) throw new InvalidPick("That week is not published.");
    if (!isLocked(week.deadline, now)) throw new PicksHidden();
  }
  const weekIds = weekGames.map((w) => w.week.id);
  const gameIds = weekGames.flatMap((w) => w.games.map((g) => g.id));
  const [everyone, rows, lockRows, guessRows] = await Promise.all([
    db.query.members.findMany(),
    gameIds.length ? db.query.picks.findMany({ where: inArray(picks.gameId, gameIds) }) : [],
    weekIds.length ? db.query.locks.findMany({ where: inArray(locks.weekId, weekIds) }) : [],
    weekIds.length ? db.query.tiebreakerGuesses.findMany({ where: inArray(tiebreakerGuesses.weekId, weekIds) }) : [],
  ]);
  const weekOfGame = new Map<number, number>();
  for (const { week, games: slateGames } of weekGames) for (const g of slateGames) weekOfGame.set(g.id, week.id);
  const pickRows = new Map<number, PickTable[]>(weekIds.map((id) => [id, []]));
  const locksOf = new Map<number, LockTable[]>(weekIds.map((id) => [id, []]));
  const guessesOf = new Map<number, GuessTable[]>(weekIds.map((id) => [id, []]));
  for (const r of rows) pickRows.get(weekOfGame.get(r.gameId)!)?.push(r);
  for (const l of lockRows) locksOf.get(l.weekId)?.push(l);
  for (const g of guessRows) guessesOf.get(g.weekId)?.push(g);
  return new Map(
    weekGames.map(({ week, games: slateGames }) => {
      const weekPickRows = pickRows.get(week.id)!;
      const weekLocks = locksOf.get(week.id)!;
      const weekGuesses = guessesOf.get(week.id)!;
      // The board is decided a Week at a time: joining in Week 4 keeps a member
      // off Weeks 1 to 3, exactly as the engine's `playedWeek` already had it.
      const board = roster(everyone, week, pickers(weekPickRows, weekLocks, weekGuesses));
      return [
        week.id,
        groupPicks(
          board,
          slateGames.map((g) => g.id),
          weekPickRows,
          weekLocks,
          weekGuesses,
        ),
      ];
    }),
  );
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
  const invalid = tiebreakerGuessError(guess);
  if (invalid) throw new InvalidPick(invalid);
  await db
    .insert(tiebreakerGuesses)
    .values({ memberId: actor.id, weekId, guess, updatedAt: now, updatedBy: actor.id })
    .onConflictDoUpdate({
      target: [tiebreakerGuesses.memberId, tiebreakerGuesses.weekId],
      set: { guess, updatedAt: now, updatedBy: actor.id },
    });
}
