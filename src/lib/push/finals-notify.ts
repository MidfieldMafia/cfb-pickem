import "server-only";
import { inArray } from "drizzle-orm";
import { locks, memberships, picks, type Game } from "@/db/schema";
import type { Db } from "@/db/types";
import type { PushPayload } from "./payload";
import type { Pusher } from "./sender";
import { deliver, subscribedDevices, type Delivery } from "./subscriptions";

/** One game that just went Final, with the score as the feed settled it. */
export interface FinalGame {
  game: Game;
  homeScore: number;
  awayScore: number;
}

/**
 * The games whose result moved from not-final to final in one ingest pass.
 * `before` is each game's status as the rows walked in; `after` is the
 * result the feed handed back for it. A game that was already final (a score
 * correction), stayed pending, or was Void or overridden is not a Final.
 */
export function newlyFinal(
  games: Game[],
  before: (game: Game) => { status: string },
  after: (game: Game) => { status: string; homeScore: number | null; awayScore: number | null } | undefined,
): FinalGame[] {
  const out: FinalGame[] = [];
  for (const game of games) {
    const next = after(game);
    if (!next || next.status !== "final" || next.homeScore === null || next.awayScore === null) continue;
    if (before(game).status !== "pending") continue;
    out.push({ game, homeScore: next.homeScore, awayScore: next.awayScore });
  }
  return out;
}

/** The banner's body for one member: the score, and how their pick fared if they made one. */
export function finalBody(final: FinalGame, pickedTeamId: number | null, lock: boolean): string {
  const { game, homeScore, awayScore } = final;
  const homeWon = homeScore > awayScore;
  const tie = homeScore === awayScore;
  const winner = homeWon ? game.homeTeam : game.awayTeam;
  const loser = homeWon ? game.awayTeam : game.homeTeam;
  const high = Math.max(homeScore, awayScore);
  const low = Math.min(homeScore, awayScore);
  const score = tie
    ? `${game.awayTeam} ${awayScore}, ${game.homeTeam} ${homeScore}`
    : `${winner} ${high}, ${loser} ${low}`;
  if (pickedTeamId === null) return `Final: ${score}.`;
  const pickedName = pickedTeamId === game.homeTeamId ? game.homeTeam : game.awayTeam;
  const won = tie ? null : pickedTeamId === (homeWon ? game.homeTeamId : game.awayTeamId);
  const fate = won === null ? "pushes" : won ? "wins ✓" : "misses ✗";
  return `Final: ${score}. Your ${lock ? "Lock " : ""}pick ${pickedName} ${fate}.`;
}

/**
 * Tells every member with Finals on about each game that just went Final,
 * with their own pick's fate in the banner. Members are everyone in any
 * Group; the slate is one slate for all of them.
 */
export async function notifyFinals(
  db: Db,
  pusher: Pusher | null,
  finals: FinalGame[],
  now: Date = new Date(),
): Promise<Delivery> {
  const total: Delivery = { sent: 0, gone: 0, failed: 0 };
  if (!pusher || finals.length === 0) return total;
  try {
    const memberRows = await db.selectDistinct({ memberId: memberships.memberId }).from(memberships);
    const devices = await subscribedDevices(
      db,
      memberRows.map((m) => m.memberId),
      "finals",
    );
    if (devices.length === 0) return total;
    const gameIds = finals.map((f) => f.game.id);
    const [pickRows, lockRows] = await Promise.all([
      db
        .select({
          memberId: picks.memberId,
          gameId: picks.gameId,
          teamId: picks.teamId,
        })
        .from(picks)
        .where(inArray(picks.gameId, gameIds)),
      db.select({ memberId: locks.memberId, gameId: locks.gameId }).from(locks).where(inArray(locks.gameId, gameIds)),
    ]);
    const pickOf = new Map(pickRows.map((p) => [`${p.memberId}:${p.gameId}`, p]));
    const locked = new Set(lockRows.map((l) => `${l.memberId}:${l.gameId}`));
    for (const final of finals) {
      const payload = (memberId: number): PushPayload => {
        const pick = pickOf.get(`${memberId}:${final.game.id}`);
        return {
          title: `${final.game.awayTeam} at ${final.game.homeTeam}`,
          body: finalBody(final, pick?.teamId ?? null, locked.has(`${memberId}:${final.game.id}`)),
          url: "/live",
          tag: `final-${final.game.id}`,
          badge: null,
        };
      };
      const d = await deliver(db, pusher, devices, (device) => payload(device.memberId), now);
      total.sent += d.sent;
      total.gone += d.gone;
      total.failed += d.failed;
    }
    return total;
  } catch (error) {
    console.warn("Finals push skipped:", error instanceof Error ? error.message : error);
    return total;
  }
}
