/**
 * The Slate: the games a commissioner chooses for a Week, published as a
 * whole. Vocabulary follows CONTEXT.md: Week, Slate, Game, Tiebreaker Game,
 * Deadline, Void. Every function takes the database first and checks the
 * acting member; the production caller passes Neon, tests pass PGlite.
 */
import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { games, seasons, weeks, type Game, type Member, type Season, type Week } from "@/db/schema";
import type { Db } from "@/db/types";
import { weekCandidates, type CandidateGame } from "@/lib/cfbd/candidates";
import type { CfbdClient } from "@/lib/cfbd/types";
import { requireCommissioner } from "@/lib/members/members";
import { logResultChange } from "@/lib/results/audit";
import { noRainChance, type RainChanceSource } from "@/lib/weather/open-meteo";

export class InvalidSlate extends Error {}

/** Thrown when an edit that only an unpublished Slate allows hits a published one. */
export class SlatePublished extends InvalidSlate {
  constructor() {
    super("The slate is published. Void a game instead of removing it.");
  }
}

/** The one Slate view: the Week, its Games in kickoff order, and the effective Deadline. */
export interface Slate {
  week: Week;
  season: Season;
  games: Game[];
  /** Null until the Slate has a Game. */
  deadline: Date | null;
  earliestKickoff: Date | null;
}

/** The last week a season can reach: the regular season plus conference championship week. */
export const MAX_WEEK_NUMBER = 15;

/** Every week number a commissioner can open, for the console's chooser. */
export const WEEK_NUMBERS = Array.from({ length: MAX_WEEK_NUMBER }, (_, i) => i + 1);

export function isWeekNumber(weekNumber: number): boolean {
  return Number.isInteger(weekNumber) && weekNumber >= 1 && weekNumber <= MAX_WEEK_NUMBER;
}

export async function activeSeason(db: Db): Promise<Season> {
  const season = await db.query.seasons.findFirst({ where: eq(seasons.active, true) });
  if (!season) throw new InvalidSlate("There is no active season. Run the seed.");
  return season;
}

/**
 * The Week row for this number in the active season, created on first visit.
 * Callers that already hold the season pass it rather than paying for it again.
 */
export async function openWeek(db: Db, actor: Member, weekNumber: number, inSeason?: Season): Promise<Week> {
  requireCommissioner(actor);
  if (!isWeekNumber(weekNumber)) {
    throw new InvalidSlate(`Week must be between 1 and ${MAX_WEEK_NUMBER}.`);
  }
  const season = inSeason ?? (await activeSeason(db));
  const existing = await db.query.weeks.findFirst({
    where: and(eq(weeks.seasonId, season.id), eq(weeks.weekNumber, weekNumber)),
  });
  if (existing) return existing;
  const [created] = await db.insert(weeks).values({ seasonId: season.id, weekNumber }).returning();
  return created;
}

async function loadWeek(db: Db, weekId: number): Promise<Week> {
  const week = await db.query.weeks.findFirst({ where: eq(weeks.id, weekId) });
  if (!week) throw new InvalidSlate("No such week.");
  return week;
}

async function loadGame(db: Db, gameId: number): Promise<Game & { week: Week }> {
  const game = await db.query.games.findFirst({ where: eq(games.id, gameId), with: { week: true } });
  if (!game) throw new InvalidSlate("That game is not on the slate.");
  return game;
}

/** Key-order-independent JSON, because Postgres jsonb reorders object keys on the way back. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

function earliest(slateGames: Game[]): Date | null {
  return slateGames.reduce<Date | null>(
    (min, g) => (min === null || g.kickoff < min ? g.kickoff : min),
    null,
  );
}

/**
 * Before publish the Deadline floats: the earliest kickoff, or an earlier
 * instant a commissioner chose. Publishing freezes it into the Week, and
 * from then on only `setDeadline` can move it, earlier.
 */
function effectiveDeadline(week: Week, slateGames: Game[]): Date | null {
  const first = earliest(slateGames);
  if (week.published) return week.deadline;
  if (first === null) return null;
  return week.deadline && week.deadline < first ? week.deadline : first;
}

/**
 * True once the server clock has reached a published Slate's frozen Deadline:
 * one comparison, so pick entry, the Reveal, and the screens cannot disagree
 * about whether the Week is closed. An unpublished Slate never locks — its
 * Deadline still floats.
 */
export function deadlinePassed(slate: Slate, now: Date): boolean {
  return slate.week.published && slate.deadline !== null && now.getTime() >= slate.deadline.getTime();
}

export async function slateFor(db: Db, weekId: number): Promise<Slate> {
  const week = await db.query.weeks.findFirst({ where: eq(weeks.id, weekId), with: { season: true, games: true } });
  if (!week) throw new InvalidSlate("No such week.");
  const { season, games: slateGames, ...bare } = week;
  const sorted = [...slateGames].sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime() || a.id - b.id);
  return {
    week: bare,
    season,
    games: sorted,
    deadline: effectiveDeadline(bare, sorted),
    earliestKickoff: earliest(sorted),
  };
}

export async function addGame(db: Db, actor: Member, weekId: number, candidate: CandidateGame): Promise<Game> {
  requireCommissioner(actor);
  const week = await loadWeek(db, weekId);
  if (week.published) throw new SlatePublished();
  const [game] = await db
    .insert(games)
    .values({
      weekId,
      cfbdGameId: candidate.cfbdGameId,
      homeTeamId: candidate.homeTeamId,
      homeTeam: candidate.homeTeam,
      homeRank: candidate.homeRank,
      homeConference: candidate.homeConference,
      awayTeamId: candidate.awayTeamId,
      awayTeam: candidate.awayTeam,
      awayRank: candidate.awayRank,
      awayConference: candidate.awayConference,
      kickoff: candidate.kickoff,
      spread: candidate.spread,
      detail: candidate.detail,
    })
    .onConflictDoNothing()
    .returning();
  if (game) return game;
  const already = await db.query.games.findFirst({
    where: and(eq(games.weekId, weekId), eq(games.cfbdGameId, candidate.cfbdGameId)),
  });
  return already!;
}

export async function setTiebreaker(db: Db, actor: Member, weekId: number, gameId: number): Promise<Week> {
  requireCommissioner(actor);
  const game = await loadGame(db, gameId);
  if (game.weekId !== weekId) throw new InvalidSlate("That game is not on this slate.");
  if (game.void) throw new InvalidSlate("A void game cannot be the Tiebreaker Game.");
  const [updated] = await db.update(weeks).set({ tiebreakerGameId: gameId }).where(eq(weeks.id, weekId)).returning();
  return updated;
}

/** Publishing freezes the Deadline and makes the Slate visible to members. */
export async function publishSlate(db: Db, actor: Member, weekId: number, now: Date = new Date()): Promise<Slate> {
  requireCommissioner(actor);
  const slate = await slateFor(db, weekId);
  if (slate.week.published) return slate;
  if (slate.games.length === 0) throw new InvalidSlate("Add at least one game before publishing.");
  if (slate.week.tiebreakerGameId === null || !slate.games.some((g) => g.id === slate.week.tiebreakerGameId)) {
    throw new InvalidSlate("Flag a Tiebreaker Game before publishing.");
  }
  if (slate.deadline === null || slate.deadline <= now) {
    throw new InvalidSlate("The deadline has already passed; move it or pick later games.");
  }
  await db.update(weeks).set({ published: true, deadline: slate.deadline }).where(eq(weeks.id, weekId));
  return slateFor(db, weekId);
}

/** What members see: the latest published Slate in the active season, or null before one exists. */
export async function publishedSlate(db: Db): Promise<Slate | null> {
  const season = await db.query.seasons.findFirst({ where: eq(seasons.active, true) });
  if (!season) return null;
  const week = await db.query.weeks.findFirst({
    where: and(eq(weeks.seasonId, season.id), eq(weeks.published, true)),
    orderBy: [desc(weeks.weekNumber)],
  });
  if (!week) return null;
  return slateFor(db, week.id);
}

/** Weeks that exist for the active season, for the console's week chooser. */
export async function seasonWeeks(db: Db, season: Season): Promise<Week[]> {
  return db.query.weeks.findMany({ where: eq(weeks.seasonId, season.id), orderBy: [asc(weeks.weekNumber)] });
}

/**
 * Moves the Deadline earlier. Before publish it may sit anywhere at or before
 * the earliest kickoff; after publish it may only move earlier than it is.
 */
export async function setDeadline(db: Db, actor: Member, weekId: number, at: Date): Promise<Slate> {
  requireCommissioner(actor);
  if (Number.isNaN(at.getTime())) throw new InvalidSlate("That is not a valid time.");
  const slate = await slateFor(db, weekId);
  if (slate.deadline === null) throw new InvalidSlate("Add a game before setting the deadline.");
  const ceiling = slate.week.published ? slate.week.deadline! : slate.earliestKickoff!;
  const tooLate = slate.week.published ? at >= ceiling : at > ceiling;
  if (tooLate) {
    throw new InvalidSlate("The deadline can only move earlier, never later than the first kickoff.");
  }
  await db.update(weeks).set({ deadline: at }).where(eq(weeks.id, weekId));
  return slateFor(db, weekId);
}

/** Unpublished slates are freely editable; a published game can only be voided. */
export async function removeGame(db: Db, actor: Member, gameId: number): Promise<void> {
  requireCommissioner(actor);
  const game = await loadGame(db, gameId);
  if (game.week.published) throw new SlatePublished();
  if (game.week.tiebreakerGameId === gameId) {
    await db.update(weeks).set({ tiebreakerGameId: null }).where(eq(weeks.id, game.weekId));
  }
  await db.delete(games).where(eq(games.id, gameId));
}

/**
 * Void: canceled or postponed after publish. Scores zero for everyone; stays
 * on the slate with the note. Logged.
 *
 * A Lock sitting on the game becomes a Dropped Lock: the row stays, the
 * scoring engine stops counting it (`LockResult.dropped`), and the screens
 * tell the member why. Deleting it here would be irreversible — `restoreGame`
 * could not put it back, and after the Deadline the member could not either.
 */
export async function voidGame(db: Db, actor: Member, gameId: number, note: string, now: Date = new Date()): Promise<Game> {
  requireCommissioner(actor);
  const game = await loadGame(db, gameId);
  if (!game.week.published) throw new InvalidSlate("The slate is not published; remove the game instead.");
  if (game.void) return game;
  const voidNote = note.trim();
  if (voidNote.length === 0) throw new InvalidSlate("Say why in the note.");
  const [updated] = await db
    .update(games)
    .set({ void: true, voidNote, updatedAt: now })
    .where(eq(games.id, gameId))
    .returning();
  await logResultChange(db, actor.id, "void", game, updated, voidNote, now);
  return updated;
}

/**
 * Re-reads the week from CollegeFootballData and updates each slate game's
 * kickoff and pick-screen detail (and, while unpublished, its rank and
 * spread snapshot). Games stay on the slate whatever the feed says; the
 * Deadline is never touched here. Returns how many games changed.
 */
export async function refreshFromFeed(
  db: Db,
  cfbd: CfbdClient,
  weekId: number,
  rain: RainChanceSource = noRainChance,
): Promise<number> {
  const slate = await slateFor(db, weekId);
  if (slate.games.length === 0) return 0;
  const feed = await weekCandidates(cfbd, { year: slate.season.year, week: slate.week.weekNumber }, rain);
  const byId = new Map(feed.map((c) => [c.cfbdGameId, c]));
  const updates: Promise<unknown>[] = [];
  const updatedAt = new Date();
  for (const game of slate.games) {
    const fresh = byId.get(game.cfbdGameId);
    if (!fresh) continue;
    const patch: Partial<typeof games.$inferInsert> = {};
    if (fresh.kickoff.getTime() !== game.kickoff.getTime()) patch.kickoff = fresh.kickoff;
    if (canonical(fresh.detail) !== canonical(game.detail)) patch.detail = fresh.detail;
    if (!slate.week.published) {
      if (fresh.spread !== game.spread) patch.spread = fresh.spread;
      if (fresh.homeRank !== game.homeRank) patch.homeRank = fresh.homeRank;
      if (fresh.awayRank !== game.awayRank) patch.awayRank = fresh.awayRank;
    }
    if (Object.keys(patch).length === 0) continue;
    // The rows are independent, so the whole refresh costs one round trip, not one per game.
    updates.push(db.update(games).set({ ...patch, updatedAt }).where(eq(games.id, game.id)));
  }
  await Promise.all(updates);
  return updates.length;
}

/**
 * Adding a game from the console: the candidate must still be in the feed for
 * the week, so the rule lives here with `addGame` rather than in the action.
 */
export async function addGameFromFeed(
  db: Db,
  actor: Member,
  cfbd: CfbdClient,
  weekId: number,
  cfbdGameId: number,
  rain: RainChanceSource = noRainChance,
): Promise<Game> {
  requireCommissioner(actor);
  const slate = await slateFor(db, weekId);
  const feed = await weekCandidates(cfbd, { year: slate.season.year, week: slate.week.weekNumber }, rain);
  const candidate = feed.find((c) => c.cfbdGameId === cfbdGameId);
  if (!candidate) throw new InvalidSlate("That game is no longer in the feed.");
  return addGame(db, actor, weekId, candidate);
}
