/**
 * Final games' box scores: fetched from CollegeFootballData once a slate game
 * is final, stored in Neon once, and read by the Game sheet. Team stats and
 * game leaders are parsed by `./box-score`; the bar colours are worked out on
 * read by `./bar-colors`.
 *
 * Two week-wide calls cover the whole slate: `/games/teams` and
 * `/games/players`. Until CFBD publishes a game's stats they answer without
 * it (a week with none yet is `[]`), which is the ordinary state for a few
 * minutes or more after the final, so the stats gate asks again at most
 * every `STATS_RETRY_MS` until every final game has its box score. How long
 * that takes is measured on a real Saturday (#304). The call shapes and
 * traps are in docs/research/cfbd-final-game-stats.md.
 */
import "server-only";
import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { gameStats, seasonRosters, weeks, type Game, type Season } from "@/db/schema";
import type { Db } from "@/db/types";
import type { CfbdClient } from "@/lib/cfbd/types";
import { findLogoByEspnId } from "@/lib/logos";
import type { Slate } from "@/lib/slate/slate";
import { barColors } from "./bar-colors";
import { shownPosition, toBoxScore, type FinalStats, type Positions } from "./box-score";
import { effectiveResult } from "./result";

/** How often a final game still missing its box score is asked for again: two metered calls a time. */
export const STATS_RETRY_MS = 5 * 60_000;

/**
 * How long after kickoff a final game is still waited on. CFBD has had every
 * final game's stats within days; a game it never publishes would otherwise
 * cost two calls every five minutes for as long as its Week is the one
 * published. Past this the sheet simply has no box score for it.
 */
export const STATS_WAIT_MS = 3 * 24 * 60 * 60_000;

export type StatsOutcome =
  /** No final game is waiting on its box score. */
  | "idle"
  /** Another request asked within `STATS_RETRY_MS`. */
  | "fresh"
  /** This request claimed the gate and asked CollegeFootballData. */
  | "refreshed";

/**
 * The games a box score can still arrive for: final by the feed, not Void,
 * and within `STATS_WAIT_MS` of kickoff. An override alone does not count —
 * a game the feed never finished has no box score to wait for.
 */
function waitingOn(slate: Slate, now: Date): Game[] {
  return slate.games.filter(
    (g) => g.status === "final" && !g.void && now.getTime() - g.kickoff.getTime() < STATS_WAIT_MS,
  );
}

/**
 * The stats gate, beside the results gate and bounded the same way: member
 * traffic schedules the calls, and one atomic claim on
 * `weeks.stats_fetched_at` elects a single caller every `STATS_RETRY_MS`
 * across Vercel instances. The claim in the Slate in hand is checked first,
 * so most requests cost no query at all.
 *
 * On a claim, the two week-wide calls are made only if a final game has no
 * stored box score, and every game they cover is stored at once. A game they
 * do not cover yet is left for the next claim. Stored rows are never
 * refetched. Throws on a failed call; `refreshQuietly` in `@/lib/week/week`
 * catches it apart from the scores, so a failure here never touches the
 * scoreboard or the live plays.
 */
export async function refreshStatsIfStale(
  db: Db,
  cfbd: CfbdClient,
  slate: Slate,
  now: Date = new Date(),
): Promise<StatsOutcome> {
  if (!slate.week.published) return "idle";
  const finals = waitingOn(slate, now);
  if (finals.length === 0) return "idle";
  const cutoff = new Date(now.getTime() - STATS_RETRY_MS);
  const last = slate.week.statsFetchedAt;
  if (last !== null && last > cutoff) return "fresh";
  const claimed = await db
    .update(weeks)
    .set({ statsFetchedAt: now })
    .where(and(eq(weeks.id, slate.week.id), or(isNull(weeks.statsFetchedAt), lte(weeks.statsFetchedAt, cutoff))))
    .returning({ id: weeks.id });
  if (claimed.length === 0) return "fresh";

  const stored = await db
    .select({ gameId: gameStats.gameId })
    .from(gameStats)
    .where(
      inArray(
        gameStats.gameId,
        finals.map((g) => g.id),
      ),
    );
  const have = new Set(stored.map((row) => row.gameId));
  const missing = finals.filter((g) => !have.has(g.id));
  if (missing.length === 0) return "idle";
  await ingestStats(db, cfbd, slate, missing, now);
  return "refreshed";
}

/**
 * Asks for the Week's box scores and stores every missing game they cover.
 * Positions come from the season's roster, fetched the first time a box
 * score is stored; a roster call that fails stores nothing, so no box score
 * is ever kept without the positions it should have had.
 */
async function ingestStats(db: Db, cfbd: CfbdClient, slate: Slate, missing: Game[], now: Date): Promise<void> {
  const query = { year: slate.season.year, week: slate.week.weekNumber };
  const [teams, players] = await Promise.all([cfbd.gameTeamStats(query), cfbd.gamePlayerStats(query)]);
  const teamsOf = new Map(teams.map((g) => [g.id, g.teams]));
  const playersOf = new Map(players.map((g) => [g.id, g.teams]));
  const arrived = missing.filter((g) => teamsOf.has(g.cfbdGameId) && playersOf.has(g.cfbdGameId));
  if (arrived.length === 0) return;

  const positions = await seasonPositions(db, cfbd, slate.season, now);
  const rows = arrived.flatMap((game) => {
    const boxScore = toBoxScore(
      { teams: teamsOf.get(game.cfbdGameId)!, players: playersOf.get(game.cfbdGameId)! },
      positions,
    );
    return boxScore ? [{ gameId: game.id, boxScore, fetchedAt: now }] : [];
  });
  if (rows.length === 0) return;
  // Two claims cannot overlap, but a row is never replaced either way.
  await db.insert(gameStats).values(rows).onConflictDoNothing();
}

/**
 * The season's positions, from Neon, or from one `/roster?year=` call the
 * first time they are needed. Only real positions are kept: null and "?" are
 * dropped here, so a leader without one simply has none. A player the roster
 * does not list (a mid-season walk-on) is the same.
 */
async function seasonPositions(db: Db, cfbd: CfbdClient, season: Season, now: Date): Promise<Positions> {
  const cached = await db.query.seasonRosters.findFirst({ where: eq(seasonRosters.seasonId, season.id) });
  if (cached) return cached.positions;
  const positions: Record<string, string> = {};
  for (const player of await cfbd.roster(season.year)) {
    const position = shownPosition(player.position);
    if (position) positions[String(player.id)] = position;
  }
  await db.insert(seasonRosters).values({ seasonId: season.id, positions, fetchedAt: now }).onConflictDoNothing();
  return positions;
}

/**
 * One game's box score for the Game sheet, with its bar colours: null until
 * the game is final and its stats are stored — "not yet", whichever of the
 * two it is waiting on. A game voided after its stats arrived is not final,
 * so it has none either.
 */
export async function finalStats(db: Db, game: Game): Promise<FinalStats | null> {
  if (effectiveResult(game).status !== "final") return null;
  const row = await db.query.gameStats.findFirst({ where: eq(gameStats.gameId, game.id) });
  if (!row) return null;
  const colors = barColors(findLogoByEspnId(game.awayTeamId)?.colors, findLogoByEspnId(game.homeTeamId)?.colors);
  return { ...row.boxScore, colors };
}
