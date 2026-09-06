/**
 * The commissioner side of pick entry: entering or fixing any member's
 * Picks, Lock of the Week, and Tiebreaker Guess from the console, before or
 * after the Deadline, with every edit audited; and the who-hasn't-picked
 * view that drives reminders. Vocabulary follows CONTEXT.md. Every function
 * takes the database first and the acting commissioner second; `now` is the
 * server clock, injected so tests can sit on either side of the Deadline.
 */
import { and, asc, eq, inArray, lt } from "drizzle-orm";
import {
  games,
  locks,
  members,
  pickAudits,
  picks,
  tiebreakerGuesses,
  type Game,
  type Member,
  type PickAuditKind,
  type Season,
  type Week,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { formatterFor } from "@/lib/intl-time";
import { InvalidMember, requireCommissioner } from "@/lib/members/members";
import { plural } from "@/lib/plural";
import { slateFor } from "@/lib/slate/slate";
import { tiebreakerGuessError } from "./limits";
import { InvalidPick, pickSheet, type PickSheet } from "./picks";

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
  return { member, sheet: await pickSheet(db, member, weekId, now) };
}

export interface MemberProgress {
  member: Member;
  /** Picks on live (non-void) games. */
  picked: number;
  /** The team the Lock of the Week sits on, or null when not set. */
  lockTeam: string | null;
  tiebreakerGuess: number | null;
  /** Every live game picked, a Lock, and a Tiebreaker Guess. */
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
 * Who hasn't picked. Deactivated members are not chased, and neither is
 * anyone who joined after the Deadline: the scoring engine sits them out of
 * the week, so there is nothing for them to finish.
 */
export async function whoHasntPicked(db: Db, actor: Member, weekId: number, now: Date = new Date()): Promise<PickReport> {
  requireCommissioner(actor);
  const slate = await slateFor(db, weekId);
  if (!slate.week.published || !slate.week.deadline) throw new InvalidPick("That week is not published.");
  const deadline = slate.week.deadline;
  const live = slate.games.filter((g) => !g.void);
  const liveIds = live.map((g) => g.id);
  const byGame = new Map(live.map((g) => [g.id, g]));
  const [roster, pickRows, lockRows, guessRows] = await Promise.all([
    db.query.members.findMany({
      where: and(eq(members.active, true), lt(members.joinedAt, deadline)),
      orderBy: [asc(members.joinedAt), asc(members.id)],
    }),
    liveIds.length ? db.query.picks.findMany({ where: inArray(picks.gameId, liveIds) }) : [],
    db.query.locks.findMany({ where: eq(locks.weekId, weekId) }),
    db.query.tiebreakerGuesses.findMany({ where: eq(tiebreakerGuesses.weekId, weekId) }),
  ]);
  const pickedBy = new Map<number, Map<number, number>>();
  for (const p of pickRows) {
    let own = pickedBy.get(p.memberId);
    if (!own) pickedBy.set(p.memberId, (own = new Map()));
    own.set(p.gameId, p.teamId);
  }
  const lockOf = new Map(lockRows.map((l) => [l.memberId, l.gameId]));
  const guessOf = new Map(guessRows.map((g) => [g.memberId, g.guess]));
  const progress = roster.map((member): MemberProgress => {
    const own = pickedBy.get(member.id) ?? new Map<number, number>();
    const lockGame = lockOf.has(member.id) ? byGame.get(lockOf.get(member.id)!) : undefined;
    const lockedTeam = lockGame ? own.get(lockGame.id) : undefined;
    const lockTeam = lockGame && lockedTeam !== undefined ? teamNameIn(lockGame, lockedTeam) : null;
    const tiebreakerGuess = guessOf.get(member.id) ?? null;
    return {
      member,
      picked: own.size,
      lockTeam,
      tiebreakerGuess,
      complete: own.size === live.length && lockTeam !== null && tiebreakerGuess !== null,
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
  const date = formatterFor({ weekday: "short", month: "short", day: "numeric", timeZone: "America/Chicago" }, "central-day");
  const time = formatterFor({ hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }, "central-time");
  return `${date.format(deadline)} at ${time.format(deadline)} Central`;
}

/** What one member still owes, for the reminder: "2 picks, Lock of the Week, Tiebreaker Guess". */
export function owed(progress: MemberProgress, needed: number): string[] {
  const missing: string[] = [];
  const picksLeft = needed - progress.picked;
  if (picksLeft > 0) missing.push(plural(picksLeft, "pick"));
  if (progress.lockTeam === null) missing.push("Lock of the Week");
  if (progress.tiebreakerGuess === null) missing.push("Tiebreaker Guess");
  return missing;
}

/** The text a commissioner pastes into the group chat, until automated texting exists. */
export function reminderText(report: PickReport): string {
  const lead = `Saturday Slate Week ${report.week.weekNumber} picks lock ${deadlineInCentral(report.deadline)}.`;
  const behind = report.members.filter((m) => !m.complete);
  if (behind.length === 0) return `${lead} Everyone is in.`;
  const names = behind.map((m) => `${m.member.displayName} (${owed(m, report.needed).join(", ")})`);
  return `${lead} Still need: ${names.join(", ")}.`;
}

async function loadGame(db: Db, weekId: number, gameId: number): Promise<Game> {
  const game = await db.query.games.findFirst({ where: eq(games.id, gameId) });
  if (!game || game.weekId !== weekId) throw new InvalidPick("That game is not on this week's slate.");
  return game;
}

/** The display name of a team in a game, by CollegeFootballData team id. */
function teamNameIn(game: Game, teamId: number): string {
  return teamId === game.homeTeamId ? game.homeTeam : game.awayTeam;
}

/**
 * Sets or replaces one member's Pick for a Game on the commissioner's say-so.
 * The Deadline does not apply; the audit row does, always, so a late change
 * is on the record even when a commissioner edits their own picks.
 */
export async function overridePick(
  db: Db,
  actor: Member,
  memberId: number,
  weekId: number,
  gameId: number,
  teamId: number,
  now: Date = new Date(),
): Promise<void> {
  requireCommissioner(actor);
  const game = await loadGame(db, weekId, gameId);
  if (game.void) throw new InvalidPick("That game is void; it scores zero for everyone.");
  if (teamId !== game.homeTeamId && teamId !== game.awayTeamId) {
    throw new InvalidPick("Pick one of the two teams in the game.");
  }
  const before = await db.query.picks.findFirst({ where: and(eq(picks.memberId, memberId), eq(picks.gameId, gameId)) });
  await db
    .insert(picks)
    .values({ memberId, gameId, teamId, updatedAt: now, updatedBy: actor.id })
    .onConflictDoUpdate({ target: [picks.memberId, picks.gameId], set: { teamId, updatedAt: now, updatedBy: actor.id } });
  await logPickChange(db, actor, memberId, weekId, gameId, "pick", {
    previousValue: before ? teamNameIn(game, before.teamId) : null,
    newValue: teamNameIn(game, teamId),
    at: now,
  });
}

/**
 * Sets, moves, or clears (null) one member's Lock of the Week on the
 * commissioner's say-so. The Lock still needs a pick to sit on and still
 * refuses a void game; only the Deadline is waived.
 */
export async function overrideLock(
  db: Db,
  actor: Member,
  memberId: number,
  weekId: number,
  gameId: number | null,
  now: Date = new Date(),
): Promise<void> {
  requireCommissioner(actor);
  const before = await db.query.locks.findFirst({ where: and(eq(locks.memberId, memberId), eq(locks.weekId, weekId)) });
  const beforeGame = before ? await loadGame(db, weekId, before.gameId) : null;
  let afterGame: Game | null = null;
  if (gameId === null) {
    await db.delete(locks).where(and(eq(locks.memberId, memberId), eq(locks.weekId, weekId)));
  } else {
    afterGame = await loadGame(db, weekId, gameId);
    if (afterGame.void) throw new InvalidPick("That game is void; it cannot be the Lock of the Week.");
    const pick = await db.query.picks.findFirst({ where: and(eq(picks.memberId, memberId), eq(picks.gameId, gameId)) });
    if (!pick) throw new InvalidPick("Pick a winner in that game before locking it.");
    await db
      .insert(locks)
      .values({ memberId, weekId, gameId, updatedAt: now, updatedBy: actor.id })
      .onConflictDoUpdate({ target: [locks.memberId, locks.weekId], set: { gameId, updatedAt: now, updatedBy: actor.id } });
  }
  await logPickChange(db, actor, memberId, weekId, gameId ?? before?.gameId ?? null, "lock", {
    previousValue: beforeGame ? await lockName(db, memberId, beforeGame) : null,
    newValue: afterGame ? await lockName(db, memberId, afterGame) : null,
    at: now,
  });
}

/** Sets or clears (null) one member's Tiebreaker Guess on the commissioner's say-so. */
export async function overrideTiebreakerGuess(
  db: Db,
  actor: Member,
  memberId: number,
  weekId: number,
  guess: number | null,
  now: Date = new Date(),
): Promise<void> {
  requireCommissioner(actor);
  const before = await db.query.tiebreakerGuesses.findFirst({
    where: and(eq(tiebreakerGuesses.memberId, memberId), eq(tiebreakerGuesses.weekId, weekId)),
  });
  if (guess === null) {
    await db
      .delete(tiebreakerGuesses)
      .where(and(eq(tiebreakerGuesses.memberId, memberId), eq(tiebreakerGuesses.weekId, weekId)));
  } else {
    const invalid = tiebreakerGuessError(guess);
    if (invalid) throw new InvalidPick(invalid);
    await db
      .insert(tiebreakerGuesses)
      .values({ memberId, weekId, guess, updatedAt: now, updatedBy: actor.id })
      .onConflictDoUpdate({
        target: [tiebreakerGuesses.memberId, tiebreakerGuesses.weekId],
        set: { guess, updatedAt: now, updatedBy: actor.id },
      });
  }
  await logPickChange(db, actor, memberId, weekId, null, "tiebreaker_guess", {
    previousValue: before ? String(before.guess) : null,
    newValue: guess === null ? null : String(guess),
    at: now,
  });
}

/** A Lock reads as the team the member locked, so the audit log shows it without a join. */
async function lockName(db: Db, memberId: number, game: Game): Promise<string> {
  const pick = await db.query.picks.findFirst({ where: and(eq(picks.memberId, memberId), eq(picks.gameId, game.id)) });
  return pick ? teamNameIn(game, pick.teamId) : `${game.awayTeam} at ${game.homeTeam}`;
}

async function logPickChange(
  db: Db,
  actor: Member,
  memberId: number,
  weekId: number,
  gameId: number | null,
  kind: PickAuditKind,
  change: { previousValue: string | null; newValue: string | null; at: Date },
): Promise<void> {
  await db.insert(pickAudits).values({
    memberId,
    weekId,
    gameId,
    kind,
    previousValue: change.previousValue,
    newValue: change.newValue,
    changedBy: actor.id,
    changedAt: change.at,
  });
}

export interface PickAudit {
  id: number;
  memberId: number;
  memberName: string;
  gameId: number | null;
  kind: (typeof pickAudits.$inferSelect)["kind"];
  previousValue: string | null;
  newValue: string | null;
  changedBy: number;
  changedByName: string;
  changedAt: Date;
}

/** The week's commissioner edits, oldest first, for the console. */
export async function pickAuditsFor(db: Db, actor: Member, weekId: number): Promise<PickAudit[]> {
  requireCommissioner(actor);
  const rows = await db.query.pickAudits.findMany({
    where: eq(pickAudits.weekId, weekId),
    orderBy: [asc(pickAudits.changedAt), asc(pickAudits.id)],
  });
  const roster = await db.query.members.findMany();
  const nameOf = new Map(roster.map((m) => [m.id, m.displayName]));
  return rows.map((r) => ({
    id: r.id,
    memberId: r.memberId,
    memberName: nameOf.get(r.memberId) ?? "?",
    gameId: r.gameId,
    kind: r.kind,
    previousValue: r.previousValue,
    newValue: r.newValue,
    changedBy: r.changedBy,
    changedByName: nameOf.get(r.changedBy) ?? "?",
    changedAt: r.changedAt,
  }));
}
