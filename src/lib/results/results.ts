/**
 * Results: final scores from CollegeFootballData, a commissioner's Result
 * Override or Void on top of them, and the Reveal that grades everyone's
 * picks once the Deadline has passed. Vocabulary follows CONTEXT.md. Every
 * function takes the database first; `now` is the server clock, injected so
 * tests can sit anywhere in the week.
 */
import "server-only";
import { and, asc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { games, members, resultAudits, weeks, type Game, type Member, type ResultAuditKind, type Season, type Week } from "@/db/schema";
import type { Db } from "@/db/types";
import type { CfbdClient, CfbdGame } from "@/lib/cfbd/types";
import { joinedOrder, requireCommissioner } from "@/lib/members/members";
import { seasonPicks, weekPicks } from "@/lib/picks/picks";
import { plural } from "@/lib/plural";
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
  defaultWeekNumber,
  gameWithWeek,
  openWeek,
  seasonWeeks,
  slateFor,
  slateOrder,
  type Slate,
} from "@/lib/slate/slate";
import { logResultChange } from "./audit";
import {
  effectiveResult,
  type GameResult,
  type ResultLabel,
} from "./result";
import { toEngineMember, toEngineWeek } from "./engine";

export { effectiveResult };
export type { GameResult, ResultLabel };

export class InvalidResult extends Error {}

/** How long a refresh claim holds before member traffic may pull the feed again. */
const REFRESH_INTERVAL_MS = 5 * 60_000;
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

/** What the feed says about one game, in the shape of the `games` columns it owns. */
function feedResult(feed: CfbdGame): Pick<Game, "status" | "homeScore" | "awayScore"> {
  const scored = feed.homePoints !== null && feed.awayPoints !== null;
  if (feed.completed && scored) return { status: "final", homeScore: feed.homePoints, awayScore: feed.awayPoints };
  if (scored) return { status: "in_progress", homeScore: feed.homePoints, awayScore: feed.awayPoints };
  return { status: "scheduled", homeScore: null, awayScore: null };
}

/**
 * Pulls the week from CollegeFootballData and writes each slate game's feed
 * score and status. Only `completed` makes a game final; a game the feed
 * never completes stays pending (there is no postponed or canceled status,
 * see docs/research/collegefootballdata-api.md), for `needsReview` to flag.
 * Overrides and voids live in other columns, so a re-run never disturbs
 * them. Returns how many games changed.
 */
export async function ingestResults(
  db: Db,
  cfbd: CfbdClient,
  slate: Slate,
  now: Date = new Date(),
): Promise<{ changed: number }> {
  const weekId = slate.week.id;
  const feed = await cfbd.games({ year: slate.season.year, week: slate.week.weekNumber });
  const byId = new Map(feed.map((g) => [g.id, g]));
  const changed = await applyGamePatches(db, slate.games, (game) => {
    const fresh = byId.get(game.cfbdGameId);
    if (!fresh) return null;
    const next = feedResult(fresh);
    const same = next.status === game.status && next.homeScore === game.homeScore && next.awayScore === game.awayScore;
    return same ? null : next;
  }, now);
  await db.update(weeks).set({ scoreboardFetchedAt: now }).where(eq(weeks.id, weekId));
  return { changed };
}

export type RefreshOutcome =
  /** No pending game has kicked off, so a call could not change anything. */
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
 * Runs `ingestResults` only when a non-void game is past kickoff without a
 * final, and only when nobody has pulled the feed in the last interval. The
 * claim is one atomic update of `weeks.scoreboard_fetched_at`, so concurrent
 * requests across Vercel instances elect a single caller.
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
  const cutoff = new Date(now.getTime() - REFRESH_INTERVAL_MS);
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
  const trimmed = note.trim();
  if (trimmed.length === 0) throw new InvalidResult("Say why in the note.");
  if (trimmed.length > 200) throw new InvalidResult("Keep the note under 200 characters.");
  return trimmed;
}

/** Result Override: a commissioner sets the final score by hand. Beats the feed until cleared; logged. */
export async function overrideResult(
  db: Db,
  actor: Member,
  gameId: number,
  input: OverrideInput,
  now: Date = new Date(),
): Promise<Game> {
  requireCommissioner(actor);
  const game = await loadGame(db, gameId);
  if (!game.week.published) throw new InvalidResult("The slate is not published; there is nothing to correct yet.");
  if (game.void) throw new InvalidResult("That game is void; restore it before setting a score.");
  const note = cleanNote(input.note);
  for (const score of [input.homeScore, input.awayScore]) {
    if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
      throw new InvalidResult(`Scores are whole numbers, 0 to ${MAX_SCORE}.`);
    }
  }
  const [updated] = await db
    .update(games)
    .set({ overrideHomeScore: input.homeScore, overrideAwayScore: input.awayScore, overrideNote: note, updatedAt: now })
    .where(eq(games.id, gameId))
    .returning();
  await logResultChange(db, actor.id, "override", game, updated, note, now);
  return updated;
}

/** Drops the Result Override so the feed's score counts again. Logged. */
export async function clearOverride(db: Db, actor: Member, gameId: number, now: Date = new Date()): Promise<Game> {
  requireCommissioner(actor);
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
export async function restoreGame(db: Db, actor: Member, gameId: number, now: Date = new Date()): Promise<Game> {
  requireCommissioner(actor);
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
export async function resultAuditsFor(db: Db, actor: Member, weekId: number): Promise<ResultAudit[]> {
  requireCommissioner(actor);
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
  /** When member traffic last pulled the feed for this Week. Null before the first pull. */
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
 * and the console opens on `defaultWeekNumber`, the same Week the chooser
 * would have landed on.
 */
export async function resultsConsole(
  db: Db,
  actor: Member,
  weekNumber: number | undefined,
  now: Date = new Date(),
): Promise<ResultsConsole> {
  requireCommissioner(actor);
  const season = await activeSeason(db);
  const existing = await seasonWeeks(db, season);
  const week = await openWeek(db, actor, weekNumber ?? defaultWeekNumber(existing), season);
  // The chooser lists the Week just opened too, which `seasonWeeks` predates.
  const weeks = existing.some((w) => w.id === week.id) ? existing : [...existing, week];
  const [slate, log] = await Promise.all([slateFor(db, week.id), resultAuditsFor(db, actor, week.id)]);
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
  /** The member's Lock of the Week sits on this pick and still counts. */
  locked: boolean;
  /**
   * The member's Lock sits on this pick but the Game is Void: a Dropped Lock.
   * Never true at the same time as `locked`. The board shows it so a member
   * who spent their Lock here is not mistaken for one who set none.
   */
  lockDropped: boolean;
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
  serverNow: Date;
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
  /** Members who played the week, in finish order: points, then Tiebreaker Guess closeness. */
  scores: WeeklyScore[];
  /** Null when nobody played the week. */
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
  totalPoints: number;
  correct: number;
  incorrect: number;
  weeklyWins: number;
  weeksPlayed: number;
  averagePoints: number | null;
  cumulativeTiebreakerError: number;
}

/** The season graded: the Leaderboard, and every played Week behind it. */
export interface SeasonResult {
  season: Season;
  /** Published Weeks whose Deadline has passed, in week order. */
  weeks: GradedWeek[];
  leaderboard: LeaderboardRow[];
  serverNow: Date;
}

/** The member rows a graded read joins against, keyed the way the engine names them. */
function memberIndex(rows: Member[]): Map<string, ScoredMember> {
  return new Map(rows.map((m) => [String(m.id), toMemberJson(m)]));
}

function toWeeklyScore(score: engine.WeeklyScore, byId: Map<string, ScoredMember>): WeeklyScore {
  const { lock } = score;
  return {
    member: byId.get(score.memberId)!,
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
function revealFrom(slate: Slate, rows: Member[], graded: engine.WeekResult, now: Date): Reveal {
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
    members: rows.map(toMemberJson),
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
          locked: pick.locked,
          lockDropped: droppedGameId === gameId,
        });
      }
      return { ...toGameView(game), picks };
    }),
    serverNow: now,
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
 * Refused before the Deadline (see `weekPicks`), for everyone.
 */
export async function weekResult(
  db: Db,
  actor: Member,
  slate: Slate,
  now: Date = new Date(),
): Promise<GradedWeekResult> {
  // The roster does not depend on the picks, so it rides along rather than waiting on them.
  const [memberPicks, roster] = await Promise.all([
    weekPicks(db, actor, slate, now),
    db.query.members.findMany({ orderBy: joinedOrder }),
  ]);
  const ids = new Set(memberPicks.map((m) => m.memberId));
  const rows = roster.filter((m) => ids.has(m.id));
  const graded = scoreWeek(slate.season.rules, toEngineWeek(slate.week, slate.games, memberPicks), rows.map(toEngineMember));
  const byId = memberIndex(rows);
  return { ...toGradedWeek(slate.week, graded, byId), reveal: revealFrom(slate, rows, graded, now) };
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
export async function seasonResult(db: Db, _actor: Member, now: Date = new Date()): Promise<SeasonResult> {
  const season = await activeSeason(db);
  const published = await db.query.weeks.findMany({
    where: and(eq(weeks.seasonId, season.id), eq(weeks.published, true)),
    orderBy: [asc(weeks.weekNumber)],
  });
  const played = published.filter((w) => w.deadline !== null && w.deadline.getTime() <= now.getTime());
  const weekIds = played.map((w) => w.id);
  const gameRows = weekIds.length ? await db.query.games.findMany({ where: inArray(games.weekId, weekIds) }) : [];
  const weekGames = played.map((week) => ({
    week,
    games: slateOrder(gameRows.filter((g) => g.weekId === week.id)),
  }));

  // The member rows do not depend on the picks, so they ride along rather than waiting.
  const [picksOf, everyone] = await Promise.all([
    seasonPicks(db, weekGames, now),
    db.query.members.findMany({ orderBy: joinedOrder }),
  ]);
  // `seasonPicks` has already applied `roster` a Week at a time, so this is not a
  // fourth answer to who is on the board — it is the season-wide superset of those
  // boards: active members plus anyone since deactivated who still has Picks, so
  // the grading has a name for every id it hands back, and an empty season is a
  // table of zeroes rather than an empty screen.
  const onABoard = new Set(weekGames.flatMap(({ week }) => picksOf.get(week.id)!.map((m) => m.memberId)));
  const rows = everyone.filter((m) => m.active || onABoard.has(m.id));

  const graded = scoreSeason(
    season.rules,
    weekGames.map(({ week, games: slateGames }) => toEngineWeek(week, slateGames, picksOf.get(week.id)!)),
    rows.map(toEngineMember),
  );
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
    serverNow: now,
  };
}
