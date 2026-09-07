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
import { asc, eq, inArray } from "drizzle-orm";
import {
  locks,
  members,
  pickAudits,
  picks,
  tiebreakerGuesses,
  type Member,
  type Season,
  type Week,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { formatterFor } from "@/lib/intl-time";
import { InvalidMember, joinedOrder, requireCommissioner } from "@/lib/members/members";
import { roster } from "@/lib/members/roster";
import { plural } from "@/lib/plural";
import { teamName, toGameView } from "@/lib/slate/json";
import { slateFor } from "@/lib/slate/slate";
import { pickSheet, publishedDeadline, type PickSheet } from "./picks";
import { liveGames, sheetProgress, type SheetProgress } from "./progress";

async function loadMember(db: Db, memberId: number): Promise<Member> {
  const member = await db.query.members.findFirst({ where: eq(members.id, memberId) });
  if (!member) throw new InvalidMember("No such member.");
  return member;
}

/**
 * One member's sheet as a commissioner sees it in the console, before or
 * after the Deadline. The console is the one place another member's picks
 * are readable early: a commissioner entering picks for someone has to see
 * what is already there. `weekPicks`, the Reveal, stays hidden for everyone.
 */
export async function memberSheet(
  db: Db,
  actor: Member,
  memberId: number,
  weekId: number,
  now: Date = new Date(),
): Promise<{ member: Member; sheet: PickSheet }> {
  requireCommissioner(actor);
  const member = await loadMember(db, memberId);
  return { member, sheet: await pickSheet(db, member, await slateFor(db, weekId), now) };
}

export interface MemberProgress {
  member: Member;
  /** The same count the member's own screens show, from `sheetProgress`. */
  progress: SheetProgress;
  /** Picks on live (non-void) games; `progress.picksMade`, named for the table. */
  picked: number;
  /** The team a counting Lock of the Week sits on; null when not set or when it is a Dropped Lock. */
  lockTeam: string | null;
  /** True when the Lock sits on a Void game, so the member has a Lock to move rather than one to set. */
  lockDropped: boolean;
  tiebreakerGuess: number | null;
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
 * Who hasn't picked. The table is `roster`'s answer, the same one the Reveal
 * and the scoring path read: nobody who joined after the Deadline, because the
 * week was never theirs to finish. No picks are passed, so the deactivated
 * stay off it — there is nothing to chase them about.
 */
export async function whoHasntPicked(db: Db, actor: Member, weekId: number, now: Date = new Date()): Promise<PickReport> {
  requireCommissioner(actor);
  const slate = await slateFor(db, weekId);
  const deadline = publishedDeadline(slate.week);
  const views = slate.games.map(toGameView);
  const live = liveGames(views);
  const liveIds = live.map((v) => v.game.id);
  const byGame = new Map(slate.games.map((g) => [g.id, g]));
  const [everyone, pickRows, lockRows, guessRows] = await Promise.all([
    db.query.members.findMany({ orderBy: joinedOrder }),
    liveIds.length ? db.query.picks.findMany({ where: inArray(picks.gameId, liveIds) }) : [],
    db.query.locks.findMany({ where: eq(locks.weekId, weekId) }),
    db.query.tiebreakerGuesses.findMany({ where: eq(tiebreakerGuesses.weekId, weekId) }),
  ]);
  const board = roster(everyone, slate.week);
  const pickedBy = new Map<number, Map<number, number>>();
  for (const p of pickRows) {
    let own = pickedBy.get(p.memberId);
    if (!own) pickedBy.set(p.memberId, (own = new Map()));
    own.set(p.gameId, p.teamId);
  }
  const lockOf = new Map(lockRows.map((l) => [l.memberId, l.gameId]));
  const guessOf = new Map(guessRows.map((g) => [g.memberId, g.guess]));
  const progress = board.map((member): MemberProgress => {
    const own = pickedBy.get(member.id) ?? new Map<number, number>();
    const lockGameId = lockOf.get(member.id) ?? null;
    const lockGame = lockGameId === null ? undefined : byGame.get(lockGameId);
    const lockDropped = lockGame?.void ?? false;
    const lockedTeam = lockGame && !lockDropped ? own.get(lockGame.id) : undefined;
    const tiebreakerGuess = guessOf.get(member.id) ?? null;
    const progress = sheetProgress({
      games: views,
      picked: (gameId) => own.has(gameId),
      lockGameId,
      lockDropped,
      tiebreakerGuess,
    });
    return {
      member,
      progress,
      picked: progress.picksMade,
      lockTeam: lockGame && lockedTeam !== undefined ? teamName(lockGame, lockedTeam) : null,
      lockDropped,
      tiebreakerGuess,
      complete: progress.remaining === 0,
    };
  });
  return {
    week: slate.week,
    season: slate.season,
    deadline,
    needed: live.length,
    members: progress,
    ready: progress.filter((m) => m.complete).length,
    serverNow: now,
  };
}

/** "Thu, Sep 10 at 7:00 PM Central": the group chat is in one time zone, so the reminder names it. */
export function deadlineInCentral(deadline: Date): string {
  const date = formatterFor({ weekday: "short", month: "short", day: "numeric", timeZone: "America/Chicago" });
  const time = formatterFor({ hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
  return `${date.format(deadline)} at ${time.format(deadline)} Central`;
}

/** What one member still owes, for the reminder: "2 picks, Lock of the Week, Tiebreaker Guess". */
export function owed(row: MemberProgress): string[] {
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
export async function pickAuditsFor(db: Db, actor: Member, weekId: number): Promise<PickAudit[]> {
  requireCommissioner(actor);
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
