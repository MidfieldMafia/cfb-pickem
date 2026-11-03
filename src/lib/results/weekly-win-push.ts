/**
 * The Weekly Win push (#532, rules on #493): once a Week is settled, each
 * group is told who won it. The 16:00 UTC job (`/api/cron/remind`) runs
 * `runWeeklyWinPush` in `after()`, next to the scheduled Pick reminder.
 *
 * The Week is the latest whose Deadline has passed. The run first updates its
 * results from the feed, on the same stale gate member traffic uses; while a
 * Game is still pending it sends nothing, and the next day's run tries again.
 * Once settled, each group with a Weekly Win reserves `win:<week>:<group>`
 * before it sends, so a re-run, or a later override or correction, never sends
 * a second push. A group where nobody played has no Weekly Win and sends
 * nothing.
 *
 * Recipients are the group's members now, active, with Weekly Win on
 * (`members.notify_weekly_win`) and a device: one push per group, so a member
 * in two groups gets two.
 */
import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { groups, seasons, weeks } from "@/db/schema";
import type { Db } from "@/db/types";
import type { CfbdClient } from "@/lib/cfbd/types";
import { groupBoard } from "@/lib/groups/memberships";
import { plural } from "@/lib/plural";
import { pushToMember } from "@/lib/push/deliver";
import { pushKey, reserve } from "@/lib/push/reservations";
import type { Pusher, PushPayload } from "@/lib/push/sender";
import { membersWithDevices } from "@/lib/push/settings";
import { deadlinePassed, slateFor, type Slate } from "@/lib/slate/slate";
import { weekSettled } from "./engine";
import type { WeeklyWin } from "./json";
import { weekResult } from "./results";
import { listNames } from "./summary";
import { refreshResultsIfStale } from "./writes";

/** A day, like the Pick reminder's: the news is still news the next morning, and the Leaderboard says it anyway. */
export const WEEKLY_WIN_TTL = 24 * 60 * 60;

/** The link: the device switches to the group, then opens that Week's Leaderboard. */
export const weeklyWinLink = (groupId: number, weekNumber: number) => `/go?group=${groupId}&to=/leaderboard?week=${weekNumber}`;

/**
 * What the push says to `memberId`: who won and how, or for a winner, their
 * own line. A winner of a shared Week reads their own line too.
 */
export function weeklyWinBody(
  win: Pick<WeeklyWin, "decidedBy" | "points"> & { winners: { id: number; displayName: string }[] },
  weekNumber: number,
  memberId: number,
): string {
  if (win.winners.some((w) => w.id === memberId)) return `You won Week ${weekNumber} with ${plural(win.points, "point")}.`;
  const who = listNames(win.winners);
  switch (win.decidedBy) {
    case "points":
      return `${who} won with ${plural(win.points, "point")}.`;
    case "tiebreaker":
      return `${who} won on the tiebreaker.`;
    case "shared":
      return `${who} share the Weekly Win.`;
  }
}

export interface WeeklyWinPushSent {
  groupId: number;
  memberId: number;
  /** Devices that took it. */
  sent: number;
}

export type WeeklyWinRun = { ran: false; why: string } | { ran: true; weekNumber: number; sent: WeeklyWinPushSent[] };

/** The latest published Week of the active season whose Deadline has passed, or null. */
async function latestPlayedWeek(db: Db, now: Date): Promise<Slate | null> {
  const published = await db
    .select({ id: weeks.id, published: weeks.published, deadline: weeks.deadline })
    .from(weeks)
    .innerJoin(seasons, eq(seasons.id, weeks.seasonId))
    .where(and(eq(seasons.active, true), eq(weeks.published, true)))
    .orderBy(desc(weeks.weekNumber));
  const latest = published.find((week) => deadlinePassed(week, now));
  return latest ? slateFor(db, latest.id) : null;
}

/** Updates the Week's results from the feed; a feed failure leaves the stored results to decide on. */
async function refreshed(db: Db, cfbd: () => CfbdClient, slate: Slate, now: Date): Promise<Slate> {
  try {
    return (await refreshResultsIfStale(db, cfbd(), slate, now)).slate;
  } catch (error) {
    console.warn("Weekly Win: results refresh skipped:", error instanceof Error ? error.message : error);
    return slate;
  }
}

/** The 16:00 UTC job's Weekly Win: sends each group's once its Week is settled, and says what went. */
export async function runWeeklyWinPush(
  db: Db,
  pusher: Pusher | null,
  cfbd: () => CfbdClient,
  now: Date = new Date(),
): Promise<WeeklyWinRun> {
  if (!pusher) return { ran: false, why: "push is not set up on this server" };
  const latest = await latestPlayedWeek(db, now);
  if (!latest) return { ran: false, why: "no Week has passed its Deadline" };
  const slate = await refreshed(db, cfbd, latest, now);
  if (!weekSettled(slate.games, now)) return { ran: false, why: "a game is still pending" };
  const { week } = slate;
  const [allGroups, devices] = await Promise.all([db.select().from(groups).orderBy(groups.id), membersWithDevices(db)]);
  const sent: WeeklyWinPushSent[] = [];
  for (const group of allGroups) {
    const { weeklyWin } = await weekResult(db, group.id, slate, now);
    if (!weeklyWin) continue;
    if (!(await reserve(db, pushKey.win(week.id, group.id)))) continue;
    const recipients = (await groupBoard(db, group.id))
      .map((entry) => entry.member)
      .filter((m) => m.active && m.notifyWeeklyWin && devices.has(m.id));
    const link = weeklyWinLink(group.id, week.weekNumber);
    const delivered = await Promise.all(
      recipients.map(async (m): Promise<WeeklyWinPushSent> => {
        const payload: PushPayload = {
          title: `Week ${week.weekNumber} in ${group.name}`,
          body: weeklyWinBody(weeklyWin, week.weekNumber, m.id),
          url: link,
          tag: `win-${week.weekNumber}-${group.id}`,
        };
        const delivery = await pushToMember(db, pusher, m.id, payload, { ttl: WEEKLY_WIN_TTL }, now);
        return { groupId: group.id, memberId: m.id, sent: delivery.sent };
      }),
    );
    sent.push(...delivered);
  }
  return { ran: true, weekNumber: week.weekNumber, sent };
}
