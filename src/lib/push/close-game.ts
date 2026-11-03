/**
 * Close game pushes (#531, rules on #493, from #329): the first time a slate
 * game is in the 4th quarter with 2:00 or less left and the trailing team,
 * down one score or less, has the ball, every member with Close games on
 * hears about it, once per game.
 *
 * The rule runs on one feed update's edge: `ingestResults` hands `newlyClose`
 * each game's row as it walked in and the columns the update writes, and
 * passes what comes back to a `CloseGameSink`. In the app that sink is
 * `closeGamesAfter`, which runs `pushCloseGames` in `after()`, so neither the
 * request nor the `/live/plays` pass budget waits on the push services. The
 * push is reserved under `close:<game>` before it goes (`reservations.ts`).
 */
import "server-only";
import { eq } from "drizzle-orm";
import { members, picks, type Game } from "@/db/schema";
import type { Db } from "@/db/types";
import { effectiveResult, settled } from "@/lib/results/result";
import { pushToMember } from "./deliver";
import { pushKey, reserve } from "./reservations";
import type { Pusher, PushPayload } from "./sender";
import { membersWithDevices } from "./settings";

/** One score, counting the two-point try. */
export const CLOSE_MARGIN = 8;
/** The 4th quarter. College overtime is untimed, so it never counts. */
export const CLOSE_PERIOD = 4;
/** The most clock left, in seconds. */
export const CLOSE_CLOCK_SECONDS = 2 * 60;
/** Ten minutes: after that the game has moved on and the banner would be stale (#493). */
export const CLOSE_TTL = 10 * 60;

/** The columns the rule reads, off a row or off what an update writes. */
export type CloseColumns = Pick<Game, "status" | "period" | "clock" | "homeScore" | "awayScore" | "possession">;

/** A game that has just become close, with the update's score and clock. */
export interface CloseGame {
  game: Pick<Game, "id" | "homeTeam" | "homeTeamId" | "awayTeam" | "awayTeamId">;
  homeScore: number;
  awayScore: number;
  /** Seconds left in the 4th. */
  seconds: number;
}

/** Where a feed update hands the games it just made close. */
export type CloseGameSink = (db: Db, closes: CloseGame[]) => void;

/** The feed's game clock, "08:42" (or "0:08:42"), as seconds; null for anything else. */
export function clockSeconds(clock: string | null): number | null {
  const match = clock?.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

/** Seconds left when the columns say the game is close, or null when they do not. */
function closeAt(g: CloseColumns): number | null {
  if (g.status !== "in_progress" || g.period !== CLOSE_PERIOD) return null;
  const seconds = clockSeconds(g.clock);
  if (seconds === null || seconds > CLOSE_CLOCK_SECONDS) return null;
  const { homeScore: home, awayScore: away } = g;
  if (home === null || away === null || home === away || Math.abs(home - away) > CLOSE_MARGIN) return null;
  return g.possession === (home < away ? "home" : "away") ? seconds : null;
}

/**
 * The games one update makes close: close in what it writes (`after`, or
 * undefined for a game it does not reach) and not in the row as it walked
 * in. A game that goes final in the update is not in progress, so it never
 * counts; neither does a Void or overridden game, whatever the feed says.
 * Once per game is the reservation's, at send.
 */
export function newlyClose(games: Game[], after: (game: Game) => CloseColumns | undefined, now: Date): CloseGame[] {
  const out: CloseGame[] = [];
  for (const game of games) {
    const next = after(game);
    if (!next || closeAt(game) !== null || settled(effectiveResult(game, now))) continue;
    const seconds = closeAt(next);
    if (seconds === null) continue;
    out.push({ game, homeScore: next.homeScore!, awayScore: next.awayScore!, seconds });
  }
  return out;
}

/** "1:48", "0:15". */
function clockText(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The link: that game's sheet on the Live Board. */
export const closeLink = (gameId: number) => `/live?game=${gameId}`;

/** The push for one member, by the team they picked in the game, or null when they did not pick it. */
export function closeMessage(close: CloseGame, pickedTeamId: number | null): PushPayload {
  const { game, homeScore, awayScore, seconds } = close;
  const homeTrails = homeScore < awayScore;
  const trailing = homeTrails ? `${game.homeTeam} ${homeScore}` : `${game.awayTeam} ${awayScore}`;
  const leading = homeTrails ? `${game.awayTeam} ${awayScore}` : `${game.homeTeam} ${homeScore}`;
  const withBall = homeTrails ? game.homeTeam : game.awayTeam;
  const picked =
    pickedTeamId === game.homeTeamId ? game.homeTeam : pickedTeamId === game.awayTeamId ? game.awayTeam : null;
  const body = `${clockText(seconds)} left in the 4th, ${withBall} has the ball.${picked ? ` You picked ${picked}.` : ""}`;
  return { title: `Close game: ${trailing}, ${leading}`, body, url: closeLink(game.id), tag: `close-${game.id}` };
}

export interface CloseGameSent {
  gameId: number;
  memberId: number;
  /** Devices that took it. */
  sent: number;
}

/**
 * Sends each close game to every member with Close games on and a device,
 * whatever their group: slate games are shared, so it goes once per member.
 * A game whose `close:<game>` key is already taken sends nothing.
 */
export async function pushCloseGames(db: Db, pusher: Pusher, closes: CloseGame[], now: Date = new Date()): Promise<CloseGameSent[]> {
  const sent: CloseGameSent[] = [];
  for (const close of closes) {
    if (!(await reserve(db, pushKey.close(close.game.id)))) continue;
    const [wanting, devices, pickRows] = await Promise.all([
      db.select({ id: members.id }).from(members).where(eq(members.notifyCloseGames, true)),
      membersWithDevices(db),
      db.select({ memberId: picks.memberId, teamId: picks.teamId }).from(picks).where(eq(picks.gameId, close.game.id)),
    ]);
    const pickOf = new Map(pickRows.map((p) => [p.memberId, p.teamId]));
    const recipients = wanting.filter((m) => devices.has(m.id));
    sent.push(
      ...(await Promise.all(
        recipients.map(async (m): Promise<CloseGameSent> => {
          const payload = closeMessage(close, pickOf.get(m.id) ?? null);
          const delivery = await pushToMember(db, pusher, m.id, payload, { ttl: CLOSE_TTL }, now);
          return { gameId: close.game.id, memberId: m.id, sent: delivery.sent };
        }),
      )),
    );
  }
  return sent;
}
