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
import type { RainChanceSource } from "@/lib/weather/open-meteo";

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
}

/** The last week a season can reach: the regular season plus conference championship week. */
const MAX_WEEK_NUMBER = 15;

/** Every week number a commissioner can open, for the console's chooser. */
export const WEEK_NUMBERS = Array.from({ length: MAX_WEEK_NUMBER }, (_, i) => i + 1);

export function isWeekNumber(weekNumber: number): boolean {
  return Number.isInteger(weekNumber) && weekNumber >= 1 && weekNumber <= MAX_WEEK_NUMBER;
}

async function findActiveSeason(db: Db): Promise<Season | undefined> {
  return db.query.seasons.findFirst({ where: eq(seasons.active, true) });
}

export async function activeSeason(db: Db): Promise<Season> {
  const season = await findActiveSeason(db);
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

/**
 * One Game with its Week, or undefined. The Game and its Week are slate
 * vocabulary, so the read lives here; each caller throws its own error class
 * rather than the query being written out again per module.
 */
export async function gameWithWeek(db: Db, gameId: number): Promise<(Game & { week: Week }) | undefined> {
  return db.query.games.findFirst({ where: eq(games.id, gameId), with: { week: true } });
}

async function loadGame(db: Db, gameId: number, weekId?: number): Promise<Game & { week: Week }> {
  const game = await gameWithWeek(db, gameId);
  if (!game) throw new InvalidSlate("That game is not on the slate.");
  if (weekId !== undefined && game.weekId !== weekId) throw new InvalidSlate("That game is not on this slate.");
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
export function deadlinePassed(week: Pick<Week, "published" | "deadline">, now: Date): boolean {
  return week.published && week.deadline !== null && now.getTime() >= week.deadline.getTime();
}

/**
 * Slate order: kickoff, then id. The order the pick flow walks and the order
 * every board reads in, so a screen that loads its Games by hand still shows
 * the same Slate `slateFor` would have handed it.
 */
export function slateOrder(slateGames: Game[]): Game[] {
  return [...slateGames].sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime() || a.id - b.id);
}

function toSlate(week: Week & { season: Season; games: Game[] }): Slate {
  const { season, games: slateGames, ...bare } = week;
  const sorted = slateOrder(slateGames);
  return { week: bare, season, games: sorted, deadline: effectiveDeadline(bare, sorted) };
}

export async function slateFor(db: Db, weekId: number): Promise<Slate> {
  const week = await db.query.weeks.findFirst({ where: eq(weeks.id, weekId), with: { season: true, games: true } });
  if (!week) throw new InvalidSlate("No such week.");
  return toSlate(week);
}

export async function addGame(
  db: Db,
  actor: Member,
  weekId: number,
  candidate: CandidateGame,
  inWeek?: Week,
): Promise<Game> {
  requireCommissioner(actor);
  const week = inWeek ?? (await loadWeek(db, weekId));
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
    // The unique index makes a re-add a no-op that still returns the row, so
    // there is no second read and nothing to assert about.
    .onConflictDoUpdate({ target: [games.weekId, games.cfbdGameId], set: { weekId } })
    .returning();
  return game;
}

export async function setTiebreaker(db: Db, actor: Member, weekId: number, gameId: number): Promise<Week> {
  requireCommissioner(actor);
  const game = await loadGame(db, gameId, weekId);
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
  const season = await findActiveSeason(db);
  if (!season) return null;
  // With the season and games on the week row this is the whole Slate. The
  // path runs on every page render and every pick tap, so it reads once.
  const week = await db.query.weeks.findFirst({
    where: and(eq(weeks.seasonId, season.id), eq(weeks.published, true)),
    orderBy: [desc(weeks.weekNumber)],
    with: { season: true, games: true },
  });
  return week ? toSlate(week) : null;
}

/** Weeks that exist for the active season, for the console's week chooser. */
export async function seasonWeeks(db: Db, season: Season): Promise<Week[]> {
  return db.query.weeks.findMany({ where: eq(weeks.seasonId, season.id), orderBy: [asc(weeks.weekNumber)] });
}

/**
 * The Week a console page opens on when the commissioner did not ask for one:
 * the latest published Week, else the latest that exists, else 1. Stated here
 * rather than in the route so `resultsConsole` and `week-param.ts` cannot
 * land on different Weeks for the same season.
 */
export function defaultWeekNumber(existing: Week[]): number {
  return existing.filter((w) => w.published).at(-1)?.weekNumber ?? existing.at(-1)?.weekNumber ?? 1;
}

/**
 * Moves the Deadline earlier. Before publish it may sit anywhere at or before
 * the earliest kickoff; after publish it may only move earlier than it is.
 */
export async function setDeadline(db: Db, actor: Member, weekId: number, at: Date): Promise<Slate> {
  requireCommissioner(actor);
  if (Number.isNaN(at.getTime())) throw new InvalidSlate("That is not a valid time.");
  const slate = await slateFor(db, weekId);
  const ceiling = slate.week.published ? slate.week.deadline : earliest(slate.games);
  if (ceiling === null) throw new InvalidSlate("Add a game before setting the deadline.");
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
  rain: RainChanceSource,
): Promise<number> {
  const slate = await slateFor(db, weekId);
  if (slate.games.length === 0) return 0;
  const feed = await weekCandidates(cfbd, { year: slate.season.year, week: slate.week.weekNumber }, rain);
  const byId = new Map(feed.map((c) => [c.cfbdGameId, c]));
  return applyGamePatches(db, slate.games, (game) => {
    const fresh = byId.get(game.cfbdGameId);
    if (!fresh) return null;
    const patch: Partial<typeof games.$inferInsert> = {};
    if (fresh.kickoff.getTime() !== game.kickoff.getTime()) patch.kickoff = fresh.kickoff;
    if (canonical(fresh.detail) !== canonical(game.detail)) patch.detail = fresh.detail;
    if (!slate.week.published) {
      if (fresh.spread !== game.spread) patch.spread = fresh.spread;
      if (fresh.homeRank !== game.homeRank) patch.homeRank = fresh.homeRank;
      if (fresh.awayRank !== game.awayRank) patch.awayRank = fresh.awayRank;
    }
    return patch;
  }, new Date());
}

/**
 * Writes one patch per slate game, skipping the games `patchOf` returns null
 * or nothing for. The rows are independent, so the whole pass costs one round
 * trip rather than one per game — which is the reason this is shared: every
 * feed reconciliation in the app walks a slate and patches what moved, and a
 * copy of the loop that awaits inside it pays a round trip per game instead.
 * Returns how many games changed.
 */
export async function applyGamePatches(
  db: Db,
  slateGames: Game[],
  patchOf: (game: Game) => Partial<typeof games.$inferInsert> | null,
  updatedAt: Date,
): Promise<number> {
  const updates: Promise<unknown>[] = [];
  for (const game of slateGames) {
    const patch = patchOf(game);
    if (patch === null || Object.keys(patch).length === 0) continue;
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
  rain: RainChanceSource,
): Promise<Game> {
  requireCommissioner(actor);
  const slate = await slateFor(db, weekId);
  const feed = await weekCandidates(cfbd, { year: slate.season.year, week: slate.week.weekNumber }, rain);
  const candidate = feed.find((c) => c.cfbdGameId === cfbdGameId);
  if (!candidate) throw new InvalidSlate("That game is no longer in the feed.");
  return addGame(db, actor, weekId, candidate, slate.week);
}
