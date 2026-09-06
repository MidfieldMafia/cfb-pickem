/**
 * Results: final scores from CollegeFootballData, a commissioner's Result
 * Override or Void on top of them, and the Reveal that grades everyone's
 * picks once the Deadline has passed. Vocabulary follows CONTEXT.md. Every
 * function takes the database first; `now` is the server clock, injected so
 * tests can sit anywhere in the week.
 */
import "server-only";
import { and, asc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { games, members, resultAudits, weeks, type Game, type GameStatus, type Member, type Season, type Week } from "@/db/schema";
import type { Db } from "@/db/types";
import type { CfbdClient, CfbdGame } from "@/lib/cfbd/types";
import { requireCommissioner } from "@/lib/members/members";
import { weekPicks } from "@/lib/picks/picks";
import { scoreWeek, type PickOutcome } from "@/lib/scoring";
import { toGameJson, type GameJson } from "@/lib/slate/json";
import { slateFor, type Slate } from "@/lib/slate/slate";
import {
  describeResult,
  effectiveResult,
  logResultChange,
  type GameResult,
  type ResultLabel,
  type ResultSource,
  type ResultStatus,
  type Score,
} from "./audit";
import { toEngineMember, toEngineWeek } from "./engine";

export { describeResult, effectiveResult };
export type { GameResult, ResultLabel, ResultSource, ResultStatus, Score };

export class InvalidResult extends Error {}

/** How long a refresh claim holds before member traffic may pull the feed again. */
export const REFRESH_INTERVAL_MS = 5 * 60_000;
/** A game still pending this long after kickoff is postponed, canceled, or stuck in the feed: a commissioner should look. */
export const REVIEW_AFTER_MS = 6 * 3600_000;
/** The highest score the override form accepts. The record is 222; nobody needs more. */
export const MAX_SCORE = 250;

/** True for a pending, non-void game whose kickoff was long enough ago that a final should exist by now. */
export function needsReview(game: Game, now: Date): boolean {
  return effectiveResult(game).status === "pending" && game.kickoff.getTime() + REVIEW_AFTER_MS <= now.getTime();
}

async function loadGame(db: Db, gameId: number): Promise<Game & { week: Week }> {
  const game = await db.query.games.findFirst({ where: eq(games.id, gameId), with: { week: true } });
  if (!game) throw new InvalidResult("That game is not on the slate.");
  return game;
}

/** What the feed says about one game, in the shape of the `games` columns it owns. */
function feedResult(feed: CfbdGame): { status: GameStatus; homeScore: number | null; awayScore: number | null } {
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
  let changed = 0;
  for (const game of slate.games) {
    const fresh = byId.get(game.cfbdGameId);
    if (!fresh) continue;
    const next = feedResult(fresh);
    if (next.status === game.status && next.homeScore === game.homeScore && next.awayScore === game.awayScore) continue;
    await db.update(games).set({ ...next, updatedAt: now }).where(eq(games.id, game.id));
    changed += 1;
  }
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
  kind: (typeof resultAudits.$inferSelect)["kind"];
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

export interface RevealMember {
  id: number;
  displayName: string;
  avatarId: string | null;
}

export interface RevealPick {
  memberId: number;
  teamId: number;
  outcome: PickOutcome;
  /** The member's Lock of the Week sits on this pick and still counts. */
  locked: boolean;
  /**
   * The member's Lock sits on this pick but the Game is Void: a Dropped Lock.
   * Never true at the same time as `locked`. The board shows it so a member
   * who spent their Lock here is not mistaken for one who set none.
   */
  lockDropped: boolean;
}

export interface RevealGame {
  game: GameJson;
  result: GameResult;
  /** One entry per member who picked this game, in member order. */
  picks: RevealPick[];
}

/** Everyone's picks per game after the Deadline, graded by the scoring engine where the game is final. */
export interface Reveal {
  week: Week;
  season: Season;
  members: RevealMember[];
  games: RevealGame[];
  serverNow: Date;
}

/** The Reveal. Refused before the Deadline (see `weekPicks`), for everyone. */
export async function revealFor(db: Db, actor: Member, slate: Slate, now: Date = new Date()): Promise<Reveal> {
  const memberPicks = await weekPicks(db, actor, slate, now);
  const ids = memberPicks.map((m) => m.memberId);
  const rows = ids.length
    ? await db.query.members.findMany({ where: inArray(members.id, ids), orderBy: [asc(members.joinedAt), asc(members.id)] })
    : [];
  const graded = scoreWeek(slate.season.rules, toEngineWeek(slate.week, slate.games, memberPicks), rows.map(toEngineMember));
  const scoreOf = new Map(graded.scores.map((s) => [s.memberId, s]));
  return {
    week: slate.week,
    season: slate.season,
    members: rows.map((m) => ({ id: m.id, displayName: m.displayName, avatarId: m.avatarId })),
    games: slate.games.map((game) => {
      const picks: RevealPick[] = [];
      for (const member of rows) {
        const score = scoreOf.get(String(member.id));
        const pick = score?.picks.find((p) => p.gameId === String(game.id));
        if (!score || !pick || pick.team === null) continue;
        // The engine already decided the Lock was dropped; the board reads that rather than re-deriving it.
        const lock = score.lock;
        picks.push({
          memberId: member.id,
          teamId: Number(pick.team),
          outcome: pick.outcome,
          locked: pick.locked,
          lockDropped: lock !== null && lock.gameId === String(game.id) && lock.dropped,
        });
      }
      return { game: toGameJson(game), result: effectiveResult(game), picks };
    }),
    serverNow: now,
  };
}
