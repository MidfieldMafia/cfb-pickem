/**
 * Results, read back: the Reveal that grades everyone's picks once the
 * Deadline has passed, the Weekly Scores and the Leaderboard built from it,
 * and what the results console shows. Writing a result — the feed, a Result
 * Override, a Void — is `./writes`. Vocabulary follows CONTEXT.md. Every
 * function takes the database first; `now` is the server clock, injected so
 * tests can sit anywhere in the week.
 */
import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  games,
  members,
  resultAudits,
  weeks,
  type Game,
  type ResultAuditKind,
  type Season,
  type Week,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { groupBoard, type BoardMember } from "@/lib/groups/memberships";
import type { Commissioner } from "@/lib/members/authority";
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
  consoleWeek,
  slateOrder,
  type Slate,
} from "@/lib/slate/slate";
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

/** A game still pending this long after kickoff is postponed, canceled, or stuck in the feed: a commissioner should look. */
export const REVIEW_AFTER_MS = 6 * 3600_000;

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
  return { season, played, rows, graded };
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
