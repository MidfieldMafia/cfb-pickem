/**
 * Reading pick entry: every member's Picks, Lock of the Week, and Tiebreaker
 * Guess for a Week, through one reader. Changing any of it goes through
 * `applyEdit` in `edits.ts` — the one writer — so nothing here writes.
 *
 * There used to be four readers of one Week's Picks — the member's sheet, the
 * Reveal, the season's grading, and the console's who-hasn't-picked — each
 * with its own queries, its own fold, and its own idea of who was on the week
 * and whether it could be read yet. `weekEntries` is now the only one, and
 * `seasonEntries` is the same fold over several Weeks at once.
 *
 * Vocabulary follows CONTEXT.md. Every function takes the database first and
 * the Slate the caller already loaded; `now` is the server clock, injected so
 * tests can sit on either side of the Deadline.
 */
import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { locks, picks, tiebreakerGuesses, type Game, type Member, type Season, type Week } from "@/db/schema";
import type { Db } from "@/db/types";
import { roster, type RosterMember } from "@/lib/members/roster";
import { Refusal } from "@/lib/refusal";
import { toGameView } from "@/lib/slate/json";
import { deadlinePassed, isPublished, type Slate } from "@/lib/slate/slate";
import { lockOn, sheetProgress, type LockState, type SheetProgress } from "./progress";

export class InvalidPick extends Refusal {}

/** Thrown for any pick, lock, or guess change at or after the Deadline. */
export class DeadlinePassed extends InvalidPick {
  constructor() {
    super("Picks are locked: the deadline has passed.");
  }
}

/**
 * Thrown when anyone asks for other members' picks before the Deadline.
 *
 * Deliberately not a `Refusal`: `http.ts` answers it 403, and no form asks
 * for another member's picks early, so a console edit that reached this would
 * be this code malfunctioning rather than a person mistyping.
 */
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

/** One member's entry for one Week, as every screen and the grading read it. */
export interface Entry<M> {
  member: M;
  /** In slate order. Unpicked games have no entry. */
  picks: PickRow[];
  lock: LockState;
  tiebreakerGuess: number | null;
  /** What is left before the Deadline: the same count the member's own screens show. */
  progress: SheetProgress;
}

/**
 * Whose entries to read, and so which rules apply. The reason for the read
 * decides both who the Week counts and whether the Deadline hides it, which is
 * why a caller names the reason rather than applying either rule itself.
 *
 * - `own`: one member's sheet — theirs, or a commissioner entering for them.
 *   Readable any time; nobody is filtered, because they asked for this person.
 * - `chasing`: who still owes what, for the console, the reminder, and a
 *   group's Manage screen. Readable any time, since that is when it is useful;
 *   `roster` with no widening, so nobody is chased who joined late or left.
 * - `board`: the Reveal. Hidden before the Deadline for everyone, commissioners
 *   included; `roster` widened by anyone since deactivated who has entries,
 *   because their points happened.
 */
export type Whose<M extends { id: number }> =
  | { own: M }
  | { chasing: readonly (M & RosterMember)[] }
  | { board: readonly (M & RosterMember)[] };

export interface WeekEntries<M> {
  /** The frozen Deadline: reading proves the Week is published. */
  deadline: Date;
  /** True once `now` reaches the Deadline. */
  locked: boolean;
  /** One per member the Week counts, in the order they were handed over. */
  entries: Entry<M>[];
}

/**
 * The frozen Deadline of a published Week. Published and deadline-set are one
 * condition — an unpublished Week has no frozen Deadline — so the guard hands
 * back the Date it proves exists rather than leaving each caller to assert the
 * pair and then re-read the field.
 */
export function publishedDeadline(week: Pick<Week, "published" | "deadline">): Date {
  if (!isPublished(week)) throw new InvalidPick("That week is not published.");
  return week.deadline!;
}

/**
 * The one reader of a Week's Picks. It owns the queries, the roster rule, the
 * Deadline gate, the Lock's state, and the count of what is left, so no
 * screen restates any of them. Refused for an unpublished Week (`InvalidPick`),
 * and a `board` before the Deadline (`PicksHidden`).
 */
export async function weekEntries<M extends { id: number }>(
  db: Db,
  slate: Slate,
  whose: Whose<M>,
  now: Date = new Date(),
): Promise<WeekEntries<M>> {
  const deadline = publishedDeadline(slate.week);
  const locked = deadlinePassed(slate.week, now);
  if ("board" in whose && !locked) throw new PicksHidden();
  const rows = await readRows(db, [slate.week.id], slate.games, "own" in whose ? whose.own.id : undefined);
  return { deadline, locked, entries: foldWeek(slate.week, slate.games, whose, rows) };
}

/** A Week with its Games in slate order: what `seasonEntries` needs to fold one Week's rows. */
export interface WeekGames {
  week: Week;
  games: Game[];
}

/**
 * The Reveal for several Weeks at once, keyed by week id: `weekEntries` with a
 * `board`, in three reads for the whole season rather than three per Week. The
 * Leaderboard grades every played Week on read, and the round trips, not the
 * arithmetic, are what that costs. Refused for any Week still open, exactly as
 * one Week is — reading a season is not a way around the Deadline.
 */
export async function seasonEntries<M extends { id: number }>(
  db: Db,
  board: readonly (M & RosterMember)[],
  weekGames: WeekGames[],
  now: Date = new Date(),
): Promise<Map<number, Entry<M>[]>> {
  for (const { week } of weekGames) {
    publishedDeadline(week);
    if (!deadlinePassed(week, now)) throw new PicksHidden();
  }
  const rows = await readRows(
    db,
    weekGames.map((w) => w.week.id),
    weekGames.flatMap((w) => w.games),
  );
  return new Map(
    weekGames.map(({ week, games }) => {
      const gameIds = new Set(games.map((g) => g.id));
      const own: Rows = {
        picks: rows.picks.filter((r) => gameIds.has(r.gameId)),
        locks: rows.locks.filter((l) => l.weekId === week.id),
        guesses: rows.guesses.filter((g) => g.weekId === week.id),
      };
      // The board is decided a Week at a time: joining the *group* in Week 4
      // keeps a member off Weeks 1 to 3 of it, and a week that ran while they
      // were removed is theirs on neither — exactly as `score-week.ts` has it.
      return [week.id, foldWeek(week, games, { board }, own)];
    }),
  );
}

/**
 * One member's sheet: `weekEntries` for them alone, with the Slate around it.
 * What the pick flow, review, and the console's edit screen render.
 */
export interface PickSheet {
  week: Week;
  season: Season;
  /** In kickoff order, the same order the flow walks. */
  games: Game[];
  deadline: Date;
  /** The member's own picks, in slate order. Unpicked games have no entry. */
  picks: PickRow[];
  /**
   * The Lock of the Week. A Dropped Lock sits on a Void game: it scores
   * nothing, and before the Deadline the member may move it to another game.
   */
  lock: LockState;
  tiebreakerGuess: number | null;
  /**
   * What is left before the Deadline. This is the server's count at read
   * time; a screen holding a change the server has not answered yet recounts
   * with `sheetProgress`.
   */
  progress: SheetProgress;
  /** The server clock at read time, for countdowns. */
  serverNow: Date;
  /** True once `serverNow` reaches the Deadline. */
  locked: boolean;
}

/**
 * One member's sheet for a Slate the caller already loaded. Taking the Slate
 * rather than a week id is what lets a screen read the Week once and hand the
 * same rows to the sheet, the Reveal, and the score refresh.
 */
export async function pickSheet(
  db: Db,
  actor: Pick<Member, "id">,
  slate: Slate,
  now: Date = new Date(),
): Promise<PickSheet> {
  const { deadline, locked, entries } = await weekEntries(db, slate, { own: actor }, now);
  const [{ picks: own, lock, tiebreakerGuess, progress }] = entries;
  return {
    week: slate.week,
    season: slate.season,
    games: slate.games,
    deadline,
    picks: own,
    lock,
    tiebreakerGuess,
    progress,
    serverNow: now,
    locked,
  };
}

/**
 * True while the member still has something to do before the Deadline — a Pick,
 * the Lock, or the Tiebreaker Guess. The Picks tab's dot reads it. There is no
 * submit step (every tap saves), so "submitted" means nothing is left open.
 */
export async function picksOpenFor(db: Db, actor: Pick<Member, "id">, slate: Slate, now: Date = new Date()): Promise<boolean> {
  return (await pickSheet(db, actor, slate, now)).progress.remaining > 0;
}

type PickTable = typeof picks.$inferSelect;
type LockTable = typeof locks.$inferSelect;
type GuessTable = typeof tiebreakerGuesses.$inferSelect;

interface Rows {
  picks: PickTable[];
  locks: LockTable[];
  guesses: GuessTable[];
}

/** The rows behind some Weeks' entries, for one member or for everyone. */
async function readRows(db: Db, weekIds: number[], games: Game[], memberId?: number): Promise<Rows> {
  const gameIds = games.map((g) => g.id);
  const [pickRows, lockRows, guessRows] = await Promise.all([
    gameIds.length ? db.query.picks.findMany({ where: and(inArray(picks.gameId, gameIds), memberId === undefined ? undefined : eq(picks.memberId, memberId)) }) : [],
    weekIds.length ? db.query.locks.findMany({ where: and(inArray(locks.weekId, weekIds), memberId === undefined ? undefined : eq(locks.memberId, memberId)) }) : [],
    weekIds.length
      ? db.query.tiebreakerGuesses.findMany({
          where: and(
            inArray(tiebreakerGuesses.weekId, weekIds),
            memberId === undefined ? undefined : eq(tiebreakerGuesses.memberId, memberId),
          ),
        })
      : [],
  ]);
  return { picks: pickRows, locks: lockRows, guesses: guessRows };
}

/**
 * One Week's rows folded into an `Entry` per member the Week counts.
 *
 * Who that is is `roster`'s to decide, and every member it keeps gets an
 * entry, rows or none: a blank week is an entry, not an absence. A row
 * belonging to nobody kept is dropped here rather than quietly conjuring a
 * member, which is how a deactivated member used to reach the Reveal — as a
 * side effect of a failed map lookup rather than as anyone's decision — and
 * what keeps one person's single set of Picks off a board they do not play on.
 */
function foldWeek<M extends { id: number }>(week: Week, games: Game[], whose: Whose<M>, rows: Rows): Entry<M>[] {
  const people: readonly M[] =
    "own" in whose
      ? [whose.own]
      : "chasing" in whose
        ? roster(whose.chasing, week)
        : roster(whose.board, week, pickers(rows));
  const views = games.map(toGameView);
  const order = new Map(games.map((g, i) => [g.id, i]));
  const picksOf = new Map<number, PickRow[]>();
  for (const r of rows.picks) {
    let own = picksOf.get(r.memberId);
    if (!own) picksOf.set(r.memberId, (own = []));
    own.push({ gameId: r.gameId, teamId: r.teamId, updatedAt: r.updatedAt });
  }
  const lockOf = new Map(rows.locks.map((l) => [l.memberId, l.gameId]));
  const guessOf = new Map(rows.guesses.map((g) => [g.memberId, g.guess]));
  return people.map((member) => {
    const own = (picksOf.get(member.id) ?? []).sort((a, b) => order.get(a.gameId)! - order.get(b.gameId)!);
    const picked = new Set(own.map((p) => p.gameId));
    const lock = lockOn(views, lockOf.get(member.id) ?? null);
    const tiebreakerGuess = guessOf.get(member.id) ?? null;
    return {
      member,
      picks: own,
      lock,
      tiebreakerGuess,
      progress: sheetProgress({ games: views, picked: (gameId) => picked.has(gameId), lock, tiebreakerGuess }),
    };
  });
}

/** The members with a Pick, a Lock, or a Guess on a Week: `roster`'s widening for anyone since deactivated. */
function pickers(rows: Rows): Set<number> {
  const ids = new Set<number>();
  for (const r of rows.picks) ids.add(r.memberId);
  for (const l of rows.locks) ids.add(l.memberId);
  for (const g of rows.guesses) ids.add(g.memberId);
  return ids;
}
