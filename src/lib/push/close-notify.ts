import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { locks, memberships, picks, pushGameEvents, type Game } from "@/db/schema";
import type { Db } from "@/db/types";
import type { PushPayload } from "./payload";
import type { Pusher } from "./sender";
import { deliver, subscribedDevices, type Delivery } from "./subscriptions";

/** One score, counting the two-point try. */
export const CLOSE_MARGIN = 8;
/** The fourth quarter. College overtime is untimed, so "the last two minutes" has no meaning there. */
export const CLOSE_PERIOD = 4;
/** How much fourth-quarter clock is left, at most, as seconds. */
export const CLOSE_CLOCK_SECONDS = 2 * 60;

/** The columns the close check reads, from a row or from what the feed just handed back. */
export type CloseColumns = Pick<Game, "status" | "period" | "clock" | "homeScore" | "awayScore" | "possession">;

/** "MM:SS" or "M:SS" to seconds; null for anything else. */
export function clockSeconds(clock: string | null): number | null {
  const m = clock?.match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * The moment worth a buzz: the fourth quarter with two minutes or less on
 * the clock, one team trailing by a score or less, and that team with the
 * ball — a drive to tie or win. A tie is not it (nobody is trailing), and
 * neither is the leading team running the clock out.
 */
export function isClose(g: CloseColumns): boolean {
  if (g.status !== "in_progress" || g.period !== CLOSE_PERIOD) return false;
  const seconds = clockSeconds(g.clock);
  if (seconds === null || seconds > CLOSE_CLOCK_SECONDS) return false;
  if (g.homeScore === null || g.awayScore === null || g.homeScore === g.awayScore) return false;
  if (Math.abs(g.homeScore - g.awayScore) > CLOSE_MARGIN) return false;
  const trailing = g.homeScore < g.awayScore ? "home" : "away";
  return g.possession === trailing;
}

/** One game that has just become close, with the score and clock as the feed has them. */
export interface CloseGame {
  game: Game;
  homeScore: number;
  awayScore: number;
  period: number;
  clock: string | null;
}

/** The games close now that were not close as their rows walked in. Once-per-game is enforced at send. */
export function newlyClose(games: Game[], after: (game: Game) => CloseColumns | undefined): CloseGame[] {
  const out: CloseGame[] = [];
  for (const game of games) {
    const next = after(game);
    if (!next || !isClose(next) || isClose(game)) continue;
    out.push({ game, homeScore: next.homeScore!, awayScore: next.awayScore!, period: next.period!, clock: next.clock });
  }
  return out;
}

function periodWord(period: number): string {
  return period <= 4 ? `${["1st", "2nd", "3rd", "4th"][period - 1]}` : period === 5 ? "OT" : `${period - 4}OT`;
}

/** The banner's body for one member: the score with the leader first, the clock, and where their pick stands. */
export function closeBody(close: CloseGame, pickedTeamId: number | null, lock: boolean): string {
  const { game, homeScore, awayScore, period, clock } = close;
  const homeLeads = homeScore > awayScore;
  const tied = homeScore === awayScore;
  const lead = homeLeads ? game.homeTeam : game.awayTeam;
  const trail = homeLeads ? game.awayTeam : game.homeTeam;
  const score = tied
    ? `${game.awayTeam} ${awayScore}, ${game.homeTeam} ${homeScore}`
    : `${lead} ${Math.max(homeScore, awayScore)}, ${trail} ${Math.min(homeScore, awayScore)}`;
  const when = `${periodWord(period)}${clock ? ` · ${clock}` : ""}`;
  const drive = tied ? "" : ` ${trail} has the ball.`;
  if (pickedTeamId === null) return `${score} — ${when}.${drive}`;
  const pickedName = pickedTeamId === game.homeTeamId ? game.homeTeam : game.awayTeam;
  const standing = tied
    ? "is tied"
    : pickedTeamId === (homeLeads ? game.homeTeamId : game.awayTeamId)
      ? "leads"
      : "trails";
  return `${score} — ${when}.${drive} Your ${lock ? "Lock " : ""}pick ${pickedName} ${standing}.`;
}

/**
 * Tells every member with Close games on about each game that just became
 * one, the first time only: a row in `push_game_events` per game, claimed
 * before sending, so possession changing hands every poll of the last two
 * minutes is announced once.
 */
export async function notifyClose(
  db: Db,
  pusher: Pusher | null,
  closes: CloseGame[],
  now: Date = new Date(),
): Promise<Delivery> {
  const total: Delivery = { sent: 0, gone: 0, failed: 0 };
  if (!pusher || closes.length === 0) return total;
  try {
    const claimed = await db
      .insert(pushGameEvents)
      .values(closes.map((c) => ({ gameId: c.game.id, kind: "close", sentAt: now })))
      .onConflictDoNothing()
      .returning({ gameId: pushGameEvents.gameId });
    const fresh = closes.filter((c) => claimed.some((row) => row.gameId === c.game.id));
    if (fresh.length === 0) return total;
    const memberRows = await db.selectDistinct({ memberId: memberships.memberId }).from(memberships);
    const devices = await subscribedDevices(
      db,
      memberRows.map((m) => m.memberId),
      "close",
    );
    if (devices.length === 0) return total;
    const gameIds = fresh.map((c) => c.game.id);
    const [pickRows, lockRows] = await Promise.all([
      db
        .select({ memberId: picks.memberId, gameId: picks.gameId, teamId: picks.teamId })
        .from(picks)
        .where(inArray(picks.gameId, gameIds)),
      db.select({ memberId: locks.memberId, gameId: locks.gameId }).from(locks).where(inArray(locks.gameId, gameIds)),
    ]);
    const pickOf = new Map(pickRows.map((p) => [`${p.memberId}:${p.gameId}`, p]));
    const locked = new Set(lockRows.map((l) => `${l.memberId}:${l.gameId}`));
    for (const close of fresh) {
      const payload = (memberId: number): PushPayload => {
        const pick = pickOf.get(`${memberId}:${close.game.id}`);
        return {
          title: `Close game: ${close.game.awayTeam} at ${close.game.homeTeam}`,
          body: closeBody(close, pick?.teamId ?? null, locked.has(`${memberId}:${close.game.id}`)),
          url: "/live",
          tag: `close-${close.game.id}`,
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
    console.warn("Close-game push skipped:", error instanceof Error ? error.message : error);
    return total;
  }
}

/** Test seam: whether a close alert has gone out for a game. */
export async function closeAlerted(db: Db, gameId: number): Promise<boolean> {
  const rows = await db
    .select({ gameId: pushGameEvents.gameId })
    .from(pushGameEvents)
    .where(and(eq(pushGameEvents.gameId, gameId), eq(pushGameEvents.kind, "close")));
  return rows.length > 0;
}
