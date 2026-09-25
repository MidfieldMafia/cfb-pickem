/**
 * The commissioner side of pick entry, minus the writing: one member's sheet
 * read early, the who-hasn't-picked view that drives reminders, and the
 * change log. Entering or fixing anyone's Picks, Lock of the Week, or
 * Tiebreaker Guess goes through `applyEdit` in `edits.ts` under a
 * commissioner `Authority` — the same writer the phone uses — so the rules
 * exist once and the audit row is a property of the Authority rather than of
 * three functions that live here.
 *
 * Vocabulary follows CONTEXT.md. Every function takes the database first and
 * the acting commissioner second; `now` is the server clock, injected so
 * tests can sit on either side of the Deadline.
 */
import "server-only";
import { asc, eq } from "drizzle-orm";
import { members, pickAudits, type Member, type Season, type Week } from "@/db/schema";
import type { Db } from "@/db/types";
import { formatterFor } from "@/lib/intl-time";
import type { Commissioner } from "@/lib/members/authority";
import { InvalidMember, joinedOrder } from "@/lib/members/members";
import type { RosterMember } from "@/lib/members/roster";
import { plural } from "@/lib/plural";
import { teamName, toGameView } from "@/lib/slate/json";
import { slateFor, type Slate } from "@/lib/slate/slate";
import { pickSheet, weekEntries, type Entry, type PickSheet } from "./picks";
import { liveGames } from "./progress";

async function loadMember(db: Db, memberId: number): Promise<Member> {
  const member = await db.query.members.findFirst({ where: eq(members.id, memberId) });
  if (!member) throw new InvalidMember("No such member.");
  return member;
}

/**
 * One member's sheet as a commissioner sees it in the console, before or
 * after the Deadline. The console is the one place another member's picks
 * are readable early: a commissioner entering picks for someone has to see
 * what is already there. The Reveal stays hidden for everyone.
 */
export async function memberSheet(
  db: Db,
  actor: Commissioner,
  memberId: number,
  slate: Slate,
  now: Date = new Date(),
): Promise<{ member: Member; sheet: PickSheet }> {
  const member = await loadMember(db, memberId);
  return { member, sheet: await pickSheet(db, member, slate, now) };
}

/** One member's entry as the who-hasn't-picked table shows it. */
export interface MemberProgress<M = Member> extends Entry<M> {
  /** The team a counting Lock of the Week sits on; null when there is none or it is a Dropped Lock. */
  lockTeam: string | null;
  /** Nothing left: every live game picked, a Lock that counts, and a Tiebreaker Guess. */
  complete: boolean;
}

/** Who has finished and who still owes what, for the console and the reminder. */
export interface PickReport {
  week: Week;
  season: Season;
  deadline: Date;
  /** Live games on the slate: the number of picks a finished member has. */
  needed: number;
  /** Active members who joined before the Deadline, in the order they joined. */
  members: MemberProgress[];
  ready: number;
  serverNow: Date;
}

/**
 * Who hasn't picked, across everyone in the app. The table is `roster`'s
 * answer, the same one the Reveal and the scoring path read: nobody who joined
 * after the Deadline, because the week was never theirs to finish, and nobody
 * deactivated, because there is nothing to chase them about.
 */
export async function whoHasntPicked(db: Db, actor: Commissioner, weekId: number, now: Date = new Date()): Promise<PickReport> {
  return pickReport(db, weekId, now);
}

/**
 * `whoHasntPicked` without a commissioner: the scheduled reminder runs with
 * nobody signed in, and reads the same table the console does.
 */
export async function pickReport(db: Db, weekId: number, now: Date = new Date()): Promise<PickReport> {
  const slate = await slateFor(db, weekId);
  const everyone = await db.query.members.findMany({ orderBy: joinedOrder });
  const { deadline, members: progress } = await weekProgress(db, slate, everyone, now);
  return {
    week: slate.week,
    season: slate.season,
    deadline,
    needed: liveGames(slate.games.map(toGameView)).length,
    members: progress,
    ready: progress.filter((m) => m.complete).length,
    serverNow: now,
  };
}

/**
 * Where each of `people` the Week counts stands on its sheet, in the order
 * given: `weekEntries` read for chasing. The one count behind the console's
 * table and a group's Manage screen, so the two can never disagree about who
 * still owes a pick. It reads teams and guesses, so it answers only to a
 * caller that decides what of them to pass on.
 */
export async function weekProgress<M extends { id: number }>(
  db: Db,
  slate: Slate,
  people: readonly (M & RosterMember)[],
  now: Date = new Date(),
): Promise<{ deadline: Date; locked: boolean; members: MemberProgress<M>[] }> {
  const { deadline, locked, entries } = await weekEntries(db, slate, { chasing: people }, now);
  const byGame = new Map(slate.games.map((g) => [g.id, g]));
  return {
    deadline,
    locked,
    members: entries.map((entry) => {
      const lockGame = entry.lock.state === "counts" ? byGame.get(entry.lock.gameId) : undefined;
      const lockedTeam = lockGame && entry.picks.find((p) => p.gameId === lockGame.id)?.teamId;
      return {
        ...entry,
        lockTeam: lockGame && lockedTeam !== undefined ? teamName(lockGame, lockedTeam) : null,
        complete: entry.progress.remaining === 0,
      };
    }),
  };
}

/** "Thu, Sep 10 at 7:00 PM Central": the group chat is in one time zone, so the reminder names it. */
export function deadlineInCentral(deadline: Date): string {
  const date = formatterFor({ weekday: "short", month: "short", day: "numeric", timeZone: "America/Chicago" });
  const time = formatterFor({ hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
  return `${date.format(deadline)} at ${time.format(deadline)} Central`;
}

/** What one member still owes, for the reminder: "2 picks, Lock of the Week, Tiebreaker Guess". */
export function owed(row: Pick<MemberProgress<unknown>, "progress">): string[] {
  const missing: string[] = [];
  const picksLeft = row.progress.liveGames - row.progress.picksMade;
  if (picksLeft > 0) missing.push(plural(picksLeft, "pick"));
  if (row.progress.lockOpen) missing.push("Lock of the Week");
  if (!row.progress.guessSet) missing.push("Tiebreaker Guess");
  return missing;
}

/** The text a commissioner pastes into the group chat, until automated texting exists. */
export function reminderText(report: PickReport): string {
  const lead = `Saturday Slate Week ${report.week.weekNumber} picks lock ${deadlineInCentral(report.deadline)}.`;
  const behind = report.members.filter((m) => !m.complete);
  if (behind.length === 0) return `${lead} Everyone is in.`;
  const names = behind.map((m) => `${m.member.displayName} (${owed(m).join(", ")})`);
  return `${lead} Still need: ${names.join(", ")}.`;
}

type PickAuditRow = typeof pickAudits.$inferSelect;

/** One audited edit as the console shows it: the stored row plus the two names. */
export interface PickAudit extends PickAuditRow {
  memberName: string;
  changedByName: string;
}

/** The week's commissioner edits, oldest first, for the console. */
export async function pickAuditsFor(db: Db, actor: Commissioner, weekId: number): Promise<PickAudit[]> {
  // Neither read depends on the other, so the commissioner waits for one round trip.
  const [rows, everyone] = await Promise.all([
    db.query.pickAudits.findMany({
      where: eq(pickAudits.weekId, weekId),
      orderBy: [asc(pickAudits.changedAt), asc(pickAudits.id)],
    }),
    db.query.members.findMany(),
  ]);
  const nameOf = new Map(everyone.map((m) => [m.id, m.displayName]));
  return rows.map((r) => ({
    ...r,
    memberName: nameOf.get(r.memberId) ?? "?",
    changedByName: nameOf.get(r.changedBy) ?? "?",
  }));
}
