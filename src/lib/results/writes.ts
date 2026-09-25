/**
 * Writing a Game's result: the only module that does. What CollegeFootballData
 * says, pulled through the stale gate or on a commissioner's "Check the feed
 * now"; and the commissioner's four changes on top of it — Result Override,
 * clearing it, Void, and Restore — each checked against the state the Game is
 * in and logged in `result_audits` on the way through. Vocabulary follows
 * CONTEXT.md; every function takes the database first, and `now` is the
 * server clock, injected so tests can sit anywhere in the week.
 *
 * Reading a result back is not here. `effectiveResult` in `./result` decides
 * what a Game's result is (Void > Override > feed) without touching the
 * database, and the graded reads in `./results` build on it.
 *
 * Void used to live with the Slate and Restore here, each with its own error
 * and its own answer to a Game already in the state asked for, and the audit
 * row sat in a module of its own only so the two could share it without an
 * import cycle. Every change now takes one path — `change` below — so the
 * rules for which state a Game can move to are read in one place, and none
 * of them can skip the log.
 */
import "server-only";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import {
  games,
  liveFeeds,
  resultAudits,
  weeks,
  type Game,
  type PossessionSide,
  type ResultAuditKind,
  type Week,
} from "@/db/schema";
import type { Db } from "@/db/types";
import type { CfbdClient, CfbdGame, CfbdScoreboardGame } from "@/lib/cfbd/types";
import type { Commissioner } from "@/lib/members/authority";
import { noteError } from "@/lib/notes";
import { Refusal } from "@/lib/refusal";
import { applyGamePatches, gameWithWeek, slateFor, type Slate } from "@/lib/slate/slate";
import { toLiveFeed, type LiveFeed } from "./live-feed";
import { describeResult, effectiveResult } from "./result";

/** Every refusal a result write makes, whichever of the four changes or the form in front of it. */
export class InvalidResult extends Refusal {}

/**
 * How long a refresh claim holds between games: a pending game is past
 * kickoff and none is under way, so the feed can only tell us a kickoff or a
 * delay, and five minutes is soon enough for either.
 */
export const REFRESH_INTERVAL_MS = 5 * 60_000;
/**
 * How long it holds while a slate game is in progress. `/scoreboard` is free,
 * so this is priced in `/live/plays` calls: one per live game per claim, about
 * 6,300 on a fifteen-game Saturday and 32,000 over a month on the 75,000-call
 * tier. The Saturday check measures the time between plays and says whether
 * to move it (see #269, #304).
 */
export const LIVE_REFRESH_INTERVAL_MS = 30_000;
/** The highest score the override form accepts. The record is 222; nobody needs more. */
export const MAX_SCORE = 250;

/** The columns a feed read owns on a `games` row. */
type FeedColumns = Pick<
  Game,
  "status" | "homeScore" | "awayScore" | "period" | "clock" | "possession" | "lastPlay" | "situation" | "liveFeed"
>;

/** The live-detail columns, all null: a game not under way has none of them. */
const NOT_LIVE = {
  period: null,
  clock: null,
  possession: null,
  lastPlay: null,
  situation: null,
  liveFeed: null,
} as const;

const NOT_STARTED: FeedColumns = { status: "scheduled", homeScore: null, awayScore: null, ...NOT_LIVE };

/**
 * Which team has the ball, from the scoreboard's `possession` — resolved to a
 * side here, at the seam, so nothing downstream ever sees the raw string.
 *
 * **The value has never been observed.** CFBD's DDL is
 * `current_possession character varying(5)`, which rules out team names and
 * leaves `"home"`/`"away"`, a team abbreviation, or an ESPN team id as a
 * string; CFBD's own test fixture says `'Michigan'`, which does not fit its
 * own column and so cannot be trusted either (see #172, #211). So this is
 * total: anything it cannot place is null, and a null indicator is the
 * ordinary case a screen must already handle.
 *
 * Both id branches read `homeTeam.id`/`awayTeam.id` off the same payload row,
 * so placing a value costs no second call and no name join.
 */
export function possessionSide(board: CfbdScoreboardGame): PossessionSide | null {
  const raw = board.possession?.trim().toLowerCase();
  if (!raw) return null;
  if (raw === "home" || raw === "away") return raw;
  if (raw === String(board.homeTeam.id)) return "home";
  if (raw === String(board.awayTeam.id)) return "away";
  // The whole safety net: if the feed turns out to speak abbreviations, day
  // one shows no footballs and this says exactly what to add.
  if (board.status === "in_progress") {
    console.info(`possession: unplaceable value ${JSON.stringify(board.possession)} on game ${board.id}`);
  }
  return null;
}

/**
 * What the scoreboard says about one game, in the shape of the columns it
 * owns. Only `completed` with both scores makes a game final — the database
 * refuses a final without them — so a completed game the board never scored
 * stays pending for `needsReview` to flag.
 */
function boardResult(board: CfbdScoreboardGame): FeedColumns {
  const homeScore = board.homeTeam.points;
  const awayScore = board.awayTeam.points;
  const scored = homeScore !== null && awayScore !== null;
  if (board.status === "completed" && scored) return { status: "final", homeScore, awayScore, ...NOT_LIVE };
  if (board.status === "in_progress") {
    // Under way and not yet scored is 0–0, which is a running score, not the absence of one.
    return {
      status: "in_progress",
      homeScore: homeScore ?? 0,
      awayScore: awayScore ?? 0,
      period: board.period,
      clock: board.clock,
      possession: possessionSide(board),
      lastPlay: board.lastPlay,
      situation: board.situation,
      // The play-by-play's slice is its own read; `ingestResults` lays it over this.
      liveFeed: null,
    };
  }
  return NOT_STARTED;
}

/**
 * What the `/games` feed says, which carries points and `completed` and none
 * of the live detail — no clock, no possession, no last play, no situation.
 * The backstop nulls all five rather than leaving them, so a game that rolls
 * off the board cannot keep showing the last thing it was seen doing.
 */
function feedResult(feed: CfbdGame): FeedColumns {
  const scored = feed.homePoints !== null && feed.awayPoints !== null;
  if (feed.completed && scored) {
    return { status: "final", homeScore: feed.homePoints, awayScore: feed.awayPoints, ...NOT_LIVE };
  }
  if (scored) {
    return { status: "in_progress", homeScore: feed.homePoints, awayScore: feed.awayPoints, ...NOT_LIVE };
  }
  return NOT_STARTED;
}

function sameColumns(next: FeedColumns, game: Game): boolean {
  return (
    next.status === game.status &&
    next.homeScore === game.homeScore &&
    next.awayScore === game.awayScore &&
    next.period === game.period &&
    next.clock === game.clock &&
    next.possession === game.possession &&
    next.lastPlay === game.lastPlay &&
    next.situation === game.situation &&
    sameFeed(next.liveFeed, game.liveFeed)
  );
}

/**
 * Whether two row slices say the same thing. Not a plain `JSON.stringify`
 * comparison: `jsonb` hands keys back in its own order, not the order they
 * were written, so every pass would count a game under way as changed.
 */
function sameFeed(a: LiveFeed | null, b: LiveFeed | null): boolean {
  if (a === null || b === null) return a === b;
  // Every key either side has, in one order: the replacer writes both in it.
  const keys = [...new Set([a, a.play, b, b.play].flatMap((level) => Object.keys(level)))].sort();
  return JSON.stringify(a, keys) === JSON.stringify(b, keys);
}

/** What one game's play-by-play fetch came back with: the row's slice, or the reason there is none. */
type PlaysRead = { ok: true; feed: LiveFeed | null } | { ok: false };

/**
 * Fetches `/live/plays` for each game and stores what comes back, one game at
 * a time as far as failure goes: a game whose call errors or times out is
 * logged and left with the plays it last stored, and the rest are written
 * regardless. Each response overwrites the game's `live_feeds` row whole, so a
 * play revised in place is just the newer copy. Returns each game's read, by
 * `games.id`.
 */
async function ingestPlays(db: Db, cfbd: CfbdClient, live: Game[], now: Date): Promise<Map<number, PlaysRead>> {
  const settled = await Promise.allSettled(live.map((game) => cfbd.livePlays(game.cfbdGameId)));
  const reads = new Map<number, PlaysRead>();
  const rows: (typeof liveFeeds.$inferInsert)[] = [];
  settled.forEach((outcome, i) => {
    const game = live[i];
    if (outcome.status === "rejected") {
      const reason = outcome.reason instanceof Error ? outcome.reason.message : outcome.reason;
      console.warn(`Live plays skipped for game ${game.cfbdGameId}:`, reason);
      reads.set(game.id, { ok: false });
      return;
    }
    reads.set(game.id, { ok: true, feed: toLiveFeed(outcome.value, game) });
    rows.push({ gameId: game.id, drives: outcome.value.drives, fetchedAt: now });
  });
  if (rows.length > 0) {
    await db
      .insert(liveFeeds)
      .values(rows)
      .onConflictDoUpdate({
        target: liveFeeds.gameId,
        set: { drives: sql`excluded.drives`, fetchedAt: sql`excluded.fetched_at` },
      });
  }
  return reads;
}

/**
 * Pulls the scoreboard from CollegeFootballData and writes each slate game's
 * score, status, and live detail — period, clock, possession, last play and
 * down-and-distance. Only `completed` makes a game final; a game the feed
 * never completes stays pending (there is no postponed or canceled status,
 * see docs/research/collegefootballdata-api.md), for `needsReview` to flag. Overrides and voids live in other columns, so a
 * re-run never disturbs them. Returns how many games changed.
 *
 * One call covers the whole slate, which is what makes the Saturday cadence
 * affordable. But the board is the week being played and nothing else: a
 * slate game past kickoff that it does not list is either waiting for the
 * board to roll onto its week, or has rolled off it with its final unread —
 * a Thursday game before the previous Monday's has cleared, or a Saturday
 * final nobody visited for until Tuesday. For those, and only those, one
 * `/games` read for the week is the backstop. It is applied only to the games
 * the board left out, so a cached `/games` answer can never write over a
 * score the board gave in the same pass.
 *
 * Every game the scoreboard puts under way — kicked off, not final, not Void
 * or overridden — then has its live play-by-play fetched and stored
 * (`ingestPlays`), and its row takes the newest play and down-and-distance
 * from it. This, reached through the stale gate or "Check the feed now", is
 * the only caller of `/live/plays`, and it is metered per call: the gate's
 * live interval is what the quota is priced on. A game whose fetch fails
 * keeps the row slice it had.
 *
 * Deliberately does not touch `weeks.scoreboard_fetched_at`: that column is
 * the stale gate's claim, and `refreshResultsIfStale` is its only writer.
 * Stamping it here meant a commissioner pressing "Check the feed now" — which
 * calls this directly, past the gate — claimed the gate and suppressed the
 * member-scheduled pull for the next interval. It also wrote the column
 * twice in one request on the gated path, once for the claim and once here
 * inside the ingest that claim had just authorised.
 *
 * Takes no actor, unlike `refreshFromFeed`: `refreshResultsIfStale` runs it
 * for member traffic through the stale gate, which has no commissioner to
 * brand, and `refreshResults` runs it for a commissioner's own "Check the
 * feed now" over the same call — one writer, reached by both, would refuse
 * a `Commissioner` parameter it could not always supply.
 */
export async function ingestResults(
  db: Db,
  cfbd: CfbdClient,
  slate: Slate,
  now: Date = new Date(),
): Promise<{ changed: number }> {
  const board = new Map((await cfbd.scoreboard()).map((g) => [g.id, g]));
  const unlisted = new Set(
    slate.games
      .filter((g) => !board.has(g.cfbdGameId) && effectiveResult(g).status === "pending" && g.kickoff <= now)
      .map((g) => g.cfbdGameId),
  );
  const feed = new Map(
    unlisted.size ? (await cfbd.games({ year: slate.season.year, week: slate.week.weekNumber })).map((g) => [g.id, g]) : [],
  );
  const nextOf = new Map<number, FeedColumns>();
  for (const game of slate.games) {
    const listed = board.get(game.cfbdGameId);
    const backstop = unlisted.has(game.cfbdGameId) ? feed.get(game.cfbdGameId) : undefined;
    const next = listed ? boardResult(listed) : backstop ? feedResult(backstop) : null;
    if (next !== null) nextOf.set(game.id, next);
  }
  // Live is what this pass leaves under way, not what the rows walked in
  // with: a game kicking off now is fetched now, and one going final is not.
  const live = slate.games.filter(
    (game) => nextOf.get(game.id)?.status === "in_progress" && effectiveResult(game).status === "pending",
  );
  const plays = await ingestPlays(db, cfbd, live, now);
  return {
    changed: await applyGamePatches(
      db,
      slate.games,
      (game) => {
        const next = nextOf.get(game.id);
        if (next === undefined) return null;
        const read = plays.get(game.id);
        const withPlays = read ? { ...next, liveFeed: read.ok ? read.feed : game.liveFeed } : next;
        return sameColumns(withPlays, game) ? null : withPlays;
      },
      now,
    ),
  };
}

/**
 * How long the current claim holds: the live interval while any slate game
 * is under way, the idle one otherwise. Read off the rows in hand, so the
 * decision costs nothing and a test can put a game in progress and watch the
 * gate tighten.
 */
export function refreshInterval(slateGames: Game[]): number {
  return slateGames.some((g) => effectiveResult(g).live !== null) ? LIVE_REFRESH_INTERVAL_MS : REFRESH_INTERVAL_MS;
}

export type RefreshOutcome =
  /** No pending game has kicked off, or every one that has is final: a call could not change anything. */
  | "idle"
  /** Another request pulled the feed within the interval. */
  | "fresh"
  /** This request claimed the refresh and pulled the feed. */
  | "refreshed";

/** What the stale gate did, and the Slate to read on from. */
export interface RefreshedSlate {
  outcome: RefreshOutcome;
  /**
   * The Slate that was passed in, or a re-read of it when the feed actually
   * moved: a caller grading the Week straight after must not grade the scores
   * it walked in with.
   */
  slate: Slate;
}

/**
 * The stale gate: member traffic schedules feed calls, and this bounds them.
 * Runs `ingestResults` only when a call could change something — a non-void
 * game is past kickoff without a final — and only when nobody has pulled the
 * feed in the last interval: `LIVE_REFRESH_INTERVAL_MS` while a slate game
 * is under way, `REFRESH_INTERVAL_MS` between games, and never before the
 * first kickoff or once every game is final. The claim is one atomic update
 * of `weeks.scoreboard_fetched_at`, so concurrent requests across Vercel
 * instances elect a single caller; the in-process cache in `@/lib/cfbd` is
 * per instance and could not hold this bound on its own.
 */
export async function refreshResultsIfStale(
  db: Db,
  cfbd: CfbdClient,
  slate: Slate,
  now: Date = new Date(),
): Promise<RefreshedSlate> {
  const weekId = slate.week.id;
  if (!slate.week.published) return { outcome: "idle", slate };
  const waiting = slate.games.some((g) => effectiveResult(g).status === "pending" && g.kickoff <= now);
  if (!waiting) return { outcome: "idle", slate };
  const cutoff = new Date(now.getTime() - refreshInterval(slate.games));
  const claimed = await db
    .update(weeks)
    .set({ scoreboardFetchedAt: now })
    .where(and(eq(weeks.id, weekId), or(isNull(weeks.scoreboardFetchedAt), lte(weeks.scoreboardFetchedAt, cutoff))))
    .returning({ id: weeks.id });
  if (claimed.length === 0) return { outcome: "fresh", slate };
  await ingestResults(db, cfbd, slate, now);
  return { outcome: "refreshed", slate: await slateFor(db, weekId) };
}

export interface OverrideInput {
  homeScore: number;
  awayScore: number;
  note: string;
}

function cleanNote(note: string): string {
  const invalid = noteError(note);
  if (invalid) throw new InvalidResult(invalid);
  return note.trim();
}

async function loadGame(db: Db, gameId: number): Promise<Game & { week: Week }> {
  const game = await gameWithWeek(db, gameId);
  if (!game) throw new InvalidResult("That game is not on the slate.");
  return game;
}

/** What a change writes: the columns it sets, and the note its audit row carries. */
interface Move {
  set: Partial<typeof games.$inferInsert>;
  note: string | null;
}

/**
 * The one path every commissioner change takes. Loads the Game, asks `move`
 * what to write — `move` throws `InvalidResult` when the Game's state does
 * not allow the change — writes it, and logs the before and after as the
 * audit row's two values.
 */
async function change(
  db: Db,
  actor: Commissioner,
  gameId: number,
  kind: ResultAuditKind,
  now: Date,
  move: (game: Game & { week: Week }) => Move,
): Promise<Game> {
  const before = await loadGame(db, gameId);
  const { set, note } = move(before);
  const [after] = await db
    .update(games)
    .set({ ...set, updatedAt: now })
    .where(eq(games.id, gameId))
    .returning();
  await db.insert(resultAudits).values({
    gameId,
    kind,
    previousValue: describeResult(before),
    newValue: describeResult(after),
    note,
    changedBy: actor.id,
    changedAt: now,
  });
  return after;
}

/**
 * Result Override: a commissioner sets the final score by hand. Beats the feed
 * until cleared; logged.
 *
 * The `0 to MAX_SCORE` range is the caller's, not this function's — `score`
 * in `console-edits.ts` parses the two form fields against `MAX_SCORE` and
 * words the one refusal that covers every way a score can be wrong. This used
 * to re-check it here, and two of that check's three arms were unreachable:
 * the parse rejects a negative and a fraction before the range ever runs, so
 * `-1` reached a commissioner as "Missing awayScore."
 */
export function overrideResult(
  db: Db,
  actor: Commissioner,
  gameId: number,
  input: OverrideInput,
  now: Date = new Date(),
): Promise<Game> {
  return change(db, actor, gameId, "override", now, (game) => {
    if (!game.week.published) throw new InvalidResult("The slate is not published; there is nothing to correct yet.");
    if (game.void) throw new InvalidResult("That game is void; restore it before setting a score.");
    const note = cleanNote(input.note);
    return {
      set: { overrideHomeScore: input.homeScore, overrideAwayScore: input.awayScore, overrideNote: note },
      note,
    };
  });
}

/** Drops the Result Override so the feed's score counts again. Logged. */
export function clearOverride(db: Db, actor: Commissioner, gameId: number, now: Date = new Date()): Promise<Game> {
  return change(db, actor, gameId, "clear_override", now, (game) => {
    if (game.overrideHomeScore === null && game.overrideAwayScore === null) {
      throw new InvalidResult("That game has no override.");
    }
    return { set: { overrideHomeScore: null, overrideAwayScore: null, overrideNote: null }, note: null };
  });
}

/**
 * Void: canceled or postponed after publish. Scores zero for everyone; stays
 * on the slate with the note. Logged.
 *
 * A Lock sitting on the game becomes a Dropped Lock: the row stays, the
 * scoring engine stops counting it (`LockResult.dropped`), and the screens
 * tell the member why. Deleting it here would be irreversible — `restoreGame`
 * could not put it back, and after the Deadline the member could not either.
 *
 * A Game already void is refused, as `restoreGame` refuses one that is not:
 * a second Void used to return quietly, which dropped the note it was given
 * and still told the commissioner "Voided."
 */
export function voidGame(db: Db, actor: Commissioner, gameId: number, note: string, now: Date = new Date()): Promise<Game> {
  return change(db, actor, gameId, "void", now, (game) => {
    if (!game.week.published) throw new InvalidResult("The slate is not published; remove the game instead.");
    if (game.void) throw new InvalidResult("That game is already void.");
    const voidNote = cleanNote(note);
    return { set: { void: true, voidNote }, note: voidNote };
  });
}

/**
 * Undoes a Void: the game counts again with whatever the feed or an override
 * says. A Dropped Lock on it counts again too — the Void never deleted the
 * row — except for a member who already moved their Lock elsewhere, since
 * there is one Lock per member per week and moving it overwrote this one.
 */
export function restoreGame(db: Db, actor: Commissioner, gameId: number, now: Date = new Date()): Promise<Game> {
  return change(db, actor, gameId, "restore", now, (game) => {
    if (!game.void) throw new InvalidResult("That game is not void.");
    return { set: { void: false, voidNote: null }, note: null };
  });
}
