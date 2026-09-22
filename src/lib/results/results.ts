/**
 * Results: final scores from CollegeFootballData, a commissioner's Result
 * Override or Void on top of them, and the Reveal that grades everyone's
 * picks once the Deadline has passed. Vocabulary follows CONTEXT.md. Every
 * function takes the database first; `now` is the server clock, injected so
 * tests can sit anywhere in the week.
 */
import "server-only";
import { and, asc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import {
  games,
  members,
  resultAudits,
  weeks,
  type Game,
  type PossessionSide,
  type ResultAuditKind,
  type Season,
  type Week,
} from "@/db/schema";
import type { Db } from "@/db/types";
import type { CfbdClient, CfbdGame, CfbdScoreboardGame } from "@/lib/cfbd/types";
import { groupBoard, type BoardMember } from "@/lib/groups/memberships";
import type { Commissioner } from "@/lib/members/authority";
import { noteError } from "@/lib/notes";
import { seasonPicks, weekPicks, type MemberPicks } from "@/lib/picks/picks";
import { plural } from "@/lib/plural";
import { Refusal } from "@/lib/refusal";
import { scoreSeason, scoreWeek } from "@/lib/scoring";
import type * as engine from "@/lib/scoring/types";
import {
  toGameView,
  toMemberJson,
  toWeekJson,
  type GameView,
  type MemberJson,
  type WeekJson,
} from "@/lib/slate/json";
import {
  activeSeason,
  applyGamePatches,
  consoleWeek,
  gameWithWeek,
  slateFor,
  slateOrder,
  type Slate,
} from "@/lib/slate/slate";
import { logResultChange } from "./audit";
import {
  clockLabel,
  effectiveResult,
  type GameResult,
  type LiveScore,
  type ResultLabel,
} from "./result";
import { toEngineMember, toEngineWeek } from "./engine";

export { clockLabel, effectiveResult };
export type { GameResult, LiveScore, ResultLabel };

export class InvalidResult extends Refusal {}

/**
 * How long a refresh claim holds between games: a pending game is past
 * kickoff and none is under way, so the feed can only tell us a kickoff or a
 * delay, and five minutes is soon enough for either.
 */
export const REFRESH_INTERVAL_MS = 5 * 60_000;
/**
 * How long it holds while a slate game is in progress. Ninety seconds is
 * about 480 calls over a Saturday and about 3,300 over a five-Saturday month
 * on the 5,000-call tier; sixty would be about 4,600, which leaves nothing
 * for the slate builder, and a score ninety seconds old is still a live one.
 */
export const LIVE_REFRESH_INTERVAL_MS = 90_000;
/** A game still pending this long after kickoff is postponed, canceled, or stuck in the feed: a commissioner should look. */
export const REVIEW_AFTER_MS = 6 * 3600_000;
/** The highest score the override form accepts. The record is 222; nobody needs more. */
export const MAX_SCORE = 250;

/** True for a pending, non-void game whose kickoff was long enough ago that a final should exist by now. */
export function needsReview(game: Game, now: Date): boolean {
  return effectiveResult(game).status === "pending" && game.kickoff.getTime() + REVIEW_AFTER_MS <= now.getTime();
}

/**
 * What the results console says when games are overdue for a commissioner's
 * attention. The count, the hours `REVIEW_AFTER_MS` works out to, and the
 * sentence's subject with its plural already decided — a screen should not be
 * dividing by 3,600,000 or choosing between "is" and "are" in JSX.
 *
 * Null when nothing is overdue, so the notice is one condition on the screen.
 */
export interface ReviewNotice {
  count: number;
  hours: number;
  /** "One game is", "3 games are". */
  subject: string;
}

export function reviewNotice(slateGames: Game[], now: Date): ReviewNotice | null {
  const count = slateGames.filter((game) => needsReview(game, now)).length;
  if (count === 0) return null;
  return {
    count,
    hours: REVIEW_AFTER_MS / 3600_000,
    subject: count === 1 ? "One game is" : `${plural(count, "game")} are`,
  };
}

async function loadGame(db: Db, gameId: number): Promise<Game & { week: Week }> {
  const game = await gameWithWeek(db, gameId);
  if (!game) throw new InvalidResult("That game is not on the slate.");
  return game;
}

/** The columns a feed read owns on a `games` row. */
type FeedColumns = Pick<
  Game,
  "status" | "homeScore" | "awayScore" | "period" | "clock" | "possession" | "lastPlay" | "situation"
>;

/** The five live-detail columns, all null: a game not under way has none of them. */
const NOT_LIVE = { period: null, clock: null, possession: null, lastPlay: null, situation: null } as const;

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
    next.situation === game.situation
  );
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
  return {
    changed: await applyGamePatches(
      db,
      slate.games,
      (game) => {
        const listed = board.get(game.cfbdGameId);
        const backstop = unlisted.has(game.cfbdGameId) ? feed.get(game.cfbdGameId) : undefined;
        const next = listed ? boardResult(listed) : backstop ? feedResult(backstop) : null;
        return next === null || sameColumns(next, game) ? null : next;
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
export async function overrideResult(
  db: Db,
  actor: Commissioner,
  gameId: number,
  input: OverrideInput,
  now: Date = new Date(),
): Promise<Game> {
  const game = await loadGame(db, gameId);
  if (!game.week.published) throw new InvalidResult("The slate is not published; there is nothing to correct yet.");
  if (game.void) throw new InvalidResult("That game is void; restore it before setting a score.");
  const note = cleanNote(input.note);
  const [updated] = await db
    .update(games)
    .set({ overrideHomeScore: input.homeScore, overrideAwayScore: input.awayScore, overrideNote: note, updatedAt: now })
    .where(eq(games.id, gameId))
    .returning();
  await logResultChange(db, actor.id, "override", game, updated, note, now);
  return updated;
}

/** Drops the Result Override so the feed's score counts again. Logged. */
export async function clearOverride(db: Db, actor: Commissioner, gameId: number, now: Date = new Date()): Promise<Game> {
  const game = await loadGame(db, gameId);
  if (game.overrideHomeScore === null && game.overrideAwayScore === null) {
    throw new InvalidResult("That game has no override.");
  }
  const [updated] = await db
    .update(games)
    .set({ overrideHomeScore: null, overrideAwayScore: null, overrideNote: null, updatedAt: now })
    .where(eq(games.id, gameId))
    .returning();
  await logResultChange(db, actor.id, "clear_override", game, updated, null, now);
  return updated;
}

/**
 * Undoes a Void: the game counts again with whatever the feed or an override
 * says. A Dropped Lock on it counts again too — the Void never deleted the
 * row — except for a member who already moved their Lock elsewhere, since
 * there is one Lock per member per week and moving it overwrote this one.
 */
export async function restoreGame(db: Db, actor: Commissioner, gameId: number, now: Date = new Date()): Promise<Game> {
  const game = await loadGame(db, gameId);
  if (!game.void) throw new InvalidResult("That game is not void.");
  const [updated] = await db
    .update(games)
    .set({ void: false, voidNote: null, updatedAt: now })
    .where(eq(games.id, gameId))
    .returning();
  await logResultChange(db, actor.id, "restore", game, updated, null, now);
  return updated;
}

export interface ResultAudit {
  id: number;
  gameId: number;
  awayTeam: string;
  homeTeam: string;
  kind: ResultAuditKind;
  previousValue: string | null;
  newValue: string | null;
  note: string | null;
  changedBy: number;
  changedByName: string;
  changedAt: Date;
}

/** The week's result changes, oldest first, for the console. */
export async function resultAuditsFor(db: Db, actor: Commissioner, weekId: number): Promise<ResultAudit[]> {
  return db
    .select({
      id: resultAudits.id,
      gameId: resultAudits.gameId,
      awayTeam: games.awayTeam,
      homeTeam: games.homeTeam,
      kind: resultAudits.kind,
      previousValue: resultAudits.previousValue,
      newValue: resultAudits.newValue,
      note: resultAudits.note,
      changedBy: resultAudits.changedBy,
      changedByName: members.displayName,
      changedAt: resultAudits.changedAt,
    })
    .from(resultAudits)
    .innerJoin(games, eq(resultAudits.gameId, games.id))
    .innerJoin(members, eq(resultAudits.changedBy, members.id))
    .where(eq(games.weekId, weekId))
    .orderBy(asc(resultAudits.changedAt), asc(resultAudits.id));
}

/** A row of the override table: the shared pair, plus the one thing only this table asks. */
export interface ResultRow extends GameView {
  /** Pending long enough after kickoff that a commissioner should look. */
  review: boolean;
}

/** Everything `/console/results` renders, from one composition. */
export interface ResultsConsole {
  year: number;
  /** The Week on screen, created if this is the first visit to it. */
  week: WeekJson;
  /** Every Week the season has, in order, for the chooser. */
  weeks: WeekJson[];
  /** The slate in kickoff order. Empty when the Week has no games. */
  rows: ResultRow[];
  /** Null when nothing is overdue. */
  review: ReviewNotice | null;
  /**
   * When member traffic last claimed the stale gate for this Week, which is
   * the only thing that writes `weeks.scoreboard_fetched_at`. Null before the
   * first claim. A commissioner's "Check the feed now" pulls the feed without
   * claiming the gate, so it deliberately does not move this — the screen says
   * whose pull it reports.
   */
  feedCheckedAt: Date | null;
  log: ResultAudit[];
}

/**
 * The results console's Week, composed once. `currentWeek` did this for the
 * member screens; the console never got it, and its page was five sequential
 * reads with the row adapter hand-rolled underneath them — `toGameJson`
 * applied and bypassed on adjacent lines, over a shape `revealFrom` already
 * built. This is that shape, for the one screen that was still building it.
 *
 * `weekNumber` is the `?week=` a commissioner asked for; leave it undefined
 * and `consoleWeek` opens on the default Week, the same one every console page does.
 */
export async function resultsConsole(
  db: Db,
  actor: Commissioner,
  weekNumber: number | undefined,
  now: Date = new Date(),
): Promise<ResultsConsole> {
  const { season, weeks, slate } = await consoleWeek(db, actor, weekNumber);
  const log = await resultAuditsFor(db, actor, slate.week.id);
  return {
    year: season.year,
    week: toWeekJson(slate.week),
    weeks: weeks.map(toWeekJson),
    rows: slate.games.map((game) => ({ ...toGameView(game), review: needsReview(game, now) })),
    review: reviewNotice(slate.games, now),
    feedCheckedAt: slate.week.scoreboardFetchedAt,
    log,
  };
}

/**
 * A member as every graded screen names them. The Reveal, the Weekly Score
 * and the Leaderboard all carry the whole chip rather than an id, so a screen
 * renders a row without holding a second map to look the name up in.
 *
 * `MemberJson` under another name: the graded screens and the plain ones show
 * the same chip, and two shapes for it would drift.
 */
export type ScoredMember = MemberJson;

export interface RevealPick {
  memberId: number;
  teamId: number;
  outcome: engine.PickOutcome;
  /**
   * The member's Lock of the Week on this pick: `"counts"` while it earns the
   * multiplier, `"dropped"` once the Game is Void — a Dropped Lock — and null
   * when their Lock is elsewhere or unset. The board shows a Dropped Lock so a
   * member who spent theirs here is not mistaken for one who set none.
   *
   * One field rather than two booleans, because "counting" and "dropped" are
   * exclusive and a pair could say both. That exclusion used to rest on
   * `score-week` clearing `locked` in its void branch, three modules from the
   * board that promised it; here it cannot be expressed.
   */
  lock: "counts" | "dropped" | null;
  /** What this pick scored: 0 unless the game is final and the pick is correct. Carries the Lock multiplier already applied. */
  points: number;
}

/** The Game, its result, and who took which side: the shared pair plus the board's own column. */
export interface RevealGame extends GameView {
  /** One entry per member who picked this game, in member order. */
  picks: RevealPick[];
}

/** Everyone's picks per game after the Deadline, graded by the scoring engine where the game is final. */
export interface Reveal {
  week: WeekJson;
  year: number;
  members: ScoredMember[];
  games: RevealGame[];
}

/*
 * From here down the module says the same words as `@/lib/scoring/types` —
 * Weekly Score, Weekly Win, Leaderboard, from CONTEXT.md — in database ids
 * rather than the engine's strings. Two spellings of one vocabulary is the
 * point of an adapter; screens import these, and only this module and
 * `engine.ts` ever see the engine's.
 */

/**
 * One member's Weekly Score. The per-pick breakdown is not repeated here: it
 * is the Reveal's `games`, the same grading transposed, and a Weekly Score
 * that carried its own copy could drift from the board beside it.
 */
export interface WeeklyScore {
  member: ScoredMember;
  /**
   * Whether the Week counts for this member: a Played Week. False for someone
   * who was on the board and made no Pick — they show here at zero so the week
   * says they sat it out, and the season ignores the row entirely.
   */
  played: boolean;
  points: number;
  correct: number;
  incorrect: number;
  /** Picks on games that are not final yet: what is still to play for. */
  pending: number;
  /** The Game carrying the member's Lock of the Week, or null if they set none. */
  lockGameId: number | null;
  /** The Lock sat on a Void game and was released: a Dropped Lock. */
  lockDropped: boolean;
  tiebreakerGuess: number | null;
  /** Absolute error against the Tiebreaker Game's combined final score; null until it is final. */
  tiebreakerError: number | null;
}

export interface WeeklyWin {
  winners: ScoredMember[];
  points: number;
  decidedBy: engine.WeeklyWinDecidedBy;
}

/** One Week graded: what a week-results screen renders, without the board. */
export interface GradedWeek {
  week: Week;
  /** Every non-void game is final. A Weekly Win counts toward the season only when true. */
  complete: boolean;
  /**
   * Everyone on the Week's board, in finish order: Played Weeks first, then
   * points, then Tiebreaker Guess closeness. A member who made no Pick is here
   * at zero with `played` false rather than missing, so the week shows who sat
   * it out; the season counts only the played rows.
   */
  scores: WeeklyScore[];
  /** Null when nobody *played* the week. */
  weeklyWin: WeeklyWin | null;
}

/** A Week graded, with the Reveal board built from the same scoring pass. */
export interface GradedWeekResult extends GradedWeek {
  reveal: Reveal;
}

export interface LeaderboardRow {
  member: ScoredMember;
  /** 1-based; members that tie on every season tiebreak share a rank. */
  rank: number;
  /** The place this rank moved from; null when there is no earlier board to have held one on. */
  previousRank: number | null;
  totalPoints: number;
  correct: number;
  incorrect: number;
  weeklyWins: number;
  weeksPlayed: number;
  averagePoints: number | null;
  cumulativeTiebreakerError: number;
  /** Mean absolute Tiebreaker Guess miss over weeks actually guessed. Display-only; lower is better. */
  averageTiebreakerMiss: number | null;
}

/** The season graded: the Leaderboard, and every played Week behind it. */
export interface SeasonResult {
  season: Season;
  /** Published Weeks whose Deadline has passed, in week order. */
  weeks: GradedWeek[];
  leaderboard: LeaderboardRow[];
}

/** The member rows a graded read joins against, keyed the way the engine names them. */
function memberIndex(rows: readonly BoardMember[]): Map<string, ScoredMember> {
  return new Map(rows.map((m) => [String(m.id), toMemberJson(m.member)]));
}

function toWeeklyScore(score: engine.WeeklyScore, byId: Map<string, ScoredMember>): WeeklyScore {
  const { lock } = score;
  return {
    member: byId.get(score.memberId)!,
    played: score.played,
    points: score.points,
    correct: score.correct,
    incorrect: score.incorrect,
    pending: score.pending,
    lockGameId: lock === null ? null : Number(lock.gameId),
    lockDropped: lock !== null && lock.dropped,
    tiebreakerGuess: score.tiebreakerGuess,
    tiebreakerError: score.tiebreakerError,
  };
}

/** One Week as a graded read model. Assembled here so `weekResult` and `seasonResult` cannot disagree. */
function toGradedWeek(week: Week, graded: engine.WeekResult, byId: Map<string, ScoredMember>): GradedWeek {
  return {
    week,
    complete: graded.complete,
    scores: graded.scores.map((s) => toWeeklyScore(s, byId)),
    weeklyWin: toWeeklyWin(graded.weeklyWin, byId),
  };
}

function toWeeklyWin(win: engine.WeeklyWin | null, byId: Map<string, ScoredMember>): WeeklyWin | null {
  if (win === null) return null;
  return { winners: win.winners.map((id) => byId.get(id)!), points: win.points, decidedBy: win.decidedBy };
}

/**
 * The board, from a grading that has already happened. Each member's picks
 * are indexed once, so a game's row is a lookup per member rather than a scan
 * of that member's whole week.
 */
function revealFrom(slate: Slate, rows: readonly BoardMember[], graded: engine.WeekResult): Reveal {
  const scoreOf = new Map(graded.scores.map((s) => [s.memberId, s]));
  const board = rows.map((member) => {
    const score = scoreOf.get(String(member.id));
    return {
      member,
      // The engine already decided the Lock was dropped; the board reads that rather than re-deriving it.
      droppedGameId: score?.lock?.dropped ? score.lock.gameId : null,
      picks: new Map((score?.picks ?? []).map((p) => [p.gameId, p])),
    };
  });
  return {
    week: toWeekJson(slate.week),
    year: slate.season.year,
    members: rows.map((row) => toMemberJson(row.member)),
    games: slate.games.map((game) => {
      const gameId = String(game.id);
      const picks: RevealPick[] = [];
      for (const { member, droppedGameId, picks: byGame } of board) {
        const pick = byGame.get(gameId);
        if (!pick || pick.team === null) continue;
        picks.push({
          memberId: member.id,
          teamId: Number(pick.team),
          outcome: pick.outcome,
          // Dropped first: a Void game is the one case where the engine's
          // `locked` and the board's own column could otherwise both speak.
          lock: droppedGameId === gameId ? "dropped" : pick.locked ? "counts" : null,
          points: pick.points,
        });
      }
      return { ...toGameView(game), picks };
    }),
  };
}

/**
 * One Week graded, in a single scoring pass: the Reveal board, everyone's
 * Weekly Score, and the Weekly Win. The pass produces all three, so a screen
 * that shows the board and the score is one read, not two gradings that could
 * disagree.
 *
 * Takes the Slate the caller already holds rather than a week id, for the
 * reason `pickSheet` does: a visit after the Deadline may pull the feed
 * first, and the board must grade the rows that pull left behind, not a
 * third re-read of them.
 *
 * Refused before the Deadline (see `weekPicks`), for everyone — the grading
 * itself takes no actor, because nothing here turns on who is asking:
 * `weekPicks`' Deadline gate is not keyed to a caller, commissioner included.
 */
export async function weekResult(
  db: Db,
  groupId: number,
  slate: Slate,
  now: Date = new Date(),
): Promise<GradedWeekResult> {
  // The group's roster is read once and handed to both the picks reader and the
  // engine adapter, so the read path's rule and the engine's cannot be given
  // different dates for the same person. It replaces the `joinedOrder` read
  // this used to do over every member in the app.
  const group = await groupBoard(db, groupId);
  const memberPicks = await weekPicks(db, group, slate, now);
  const rows = boardRows(group, memberPicks);
  const graded = scoreWeek(slate.season.rules, toEngineWeek(slate.week, slate.games, memberPicks), rows.map(toEngineMember));
  return gradedWeekResult(slate, rows, graded);
}

/** Who a Week's board holds: the group's members that `weekPicks` or `seasonPicks` gave a row. */
function boardRows(group: readonly BoardMember[], memberPicks: readonly { memberId: number }[]): BoardMember[] {
  const ids = new Set(memberPicks.map((m) => m.memberId));
  return group.filter((m) => ids.has(m.id));
}

/** One graded Week and its Reveal, from a grading that has already happened. */
function gradedWeekResult(slate: Slate, rows: readonly BoardMember[], graded: engine.WeekResult): GradedWeekResult {
  return { ...toGradedWeek(slate.week, graded, memberIndex(rows)), reveal: revealFrom(slate, rows, graded) };
}

/**
 * The Weeks a season counts, in week order: published, and past their
 * Deadline on the server clock.
 *
 * Both halves matter, and both are easy to lose. An unpublished Week has no
 * frozen Deadline and no Slate anyone has seen. A published Week still open
 * scores zero for everyone, and counting it would drag every average down as
 * a week played (see `@/lib/scoring`) — and `weekPicks` would refuse the read
 * anyway, because the Reveal is what the Deadline gates.
 *
 * Stated once here because three screens now turn on it: the Leaderboard adds
 * these up, the week results screen offers exactly these in its chooser, and
 * `seasonResult` grades them.
 */
export async function playedWeeks(db: Db, season: Season, now: Date = new Date()): Promise<Week[]> {
  const published = await db.query.weeks.findMany({
    where: and(eq(weeks.seasonId, season.id), eq(weeks.published, true)),
    orderBy: [asc(weeks.weekNumber)],
  });
  return published.filter((w) => w.deadline !== null && w.deadline.getTime() <= now.getTime());
}

/** One grading pass over the season, before it is cut into the views screens ask for. */
interface SeasonPass {
  season: Season;
  group: BoardMember[];
  /** The played Weeks with the rows each was graded from, keyed by week id. */
  boards: Map<number, MemberPicks[]>;
  played: Week[];
  /** Every member the pass graded: `group`'s active members plus anyone since deactivated who still has Picks. */
  rows: BoardMember[];
  graded: engine.SeasonResult;
}

async function gradeSeason(db: Db, groupId: number, now: Date): Promise<SeasonPass> {
  // Neither read depends on the other, so the board waits for one round trip.
  const [season, group] = await Promise.all([activeSeason(db), groupBoard(db, groupId)]);
  const played = await playedWeeks(db, season, now);
  const weekIds = played.map((w) => w.id);
  const gameRows = weekIds.length ? await db.query.games.findMany({ where: inArray(games.weekId, weekIds) }) : [];
  const weekGames = played.map((week) => ({
    week,
    games: slateOrder(gameRows.filter((g) => g.weekId === week.id)),
  }));

  const boards = await seasonPicks(db, group, weekGames, now);
  // `seasonPicks` has already applied `roster` a Week at a time, so this is not a
  // fourth answer to who is on the board � it is the season-wide superset of those
  // boards, within this group: its active members plus anyone since deactivated
  // who still has Picks, so the grading has a name for every id it hands back,
  // and an empty season is a table of zeroes rather than an empty screen.
  const onABoard = new Set(weekGames.flatMap(({ week }) => boards.get(week.id)!.map((m) => m.memberId)));
  const rows = group.filter((m) => m.active || onABoard.has(m.id));

  const graded = scoreSeason(
    season.rules,
    weekGames.map(({ week, games: slateGames }) => toEngineWeek(week, slateGames, boards.get(week.id)!)),
    rows.map(toEngineMember),
  );
  return { season, group, boards, played, rows, graded };
}

/** The Leaderboard and the played Weeks, as the read models screens take. */
function seasonView({ season, played, rows, graded }: SeasonPass): SeasonResult {
  const byId = memberIndex(rows);
  // The engine answers in week numbers, which are unique within a season; nothing here leans on read order.
  const weekOf = new Map(played.map((w) => [w.weekNumber, w]));
  return {
    season,
    weeks: graded.weeks.map((result) => toGradedWeek(weekOf.get(result.weekNumber)!, result, byId)),
    leaderboard: graded.leaderboard.map(({ memberId, ...rest }) => ({
      member: byId.get(memberId)!,
      ...rest,
    })),
  };
}

/**
 * The season graded: the Leaderboard and every Week behind it, from one
 * `scoreSeason` pass over rows read in a fixed number of round trips. Only
 * published Weeks whose Deadline has passed count — a published Week still
 * open scores zero for everyone and would drag every average down as a week
 * played (see `@/lib/scoring`).
 *
 * Every active member gets a Leaderboard row, including before the first
 * Deadline of the season: an empty season is a table of zeroes, not an empty
 * screen.
 */
export async function seasonResult(db: Db, groupId: number, now: Date = new Date()): Promise<SeasonResult> {
  return seasonView(await gradeSeason(db, groupId, now));
}

/**
 * The season and the Week the caller is standing in, graded in one pass. Once
 * the Deadline has passed the season's played Weeks include the current one,
 * so `result` is that Week cut out of the pass rather than a second grading of
 * it: the Live Board, which wants both, pays for one read of the board and one
 * of the picks instead of two, and the two cannot disagree.
 *
 * `slate` is the one the caller already holds, for `weekResult`'s reason � a
 * visit may have pulled the feed first, and the Reveal is drawn from those
 * rows. It must be a Week the season has played, which a published Slate past
 * its Deadline is; anything else is a caller bug and throws.
 */
export async function gradedSeason(
  db: Db,
  groupId: number,
  slate: Slate,
  now: Date = new Date(),
): Promise<{ season: SeasonResult; result: GradedWeekResult }> {
  const pass = await gradeSeason(db, groupId, now);
  const graded = pass.graded.weeks.find((w) => w.weekNumber === slate.week.weekNumber);
  const board = pass.boards.get(slate.week.id);
  if (!graded || !board) throw new Error("That Week is not one the season has played.");
  return {
    season: seasonView(pass),
    result: gradedWeekResult(slate, boardRows(pass.group, board), graded),
  };
}
