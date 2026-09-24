import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, count, eq, inArray, ne } from "drizzle-orm";
import { inOneBatch } from "@/db/batch";
import {
  chatMessages,
  chatReactions,
  feedback,
  feedbackScreenshots,
  locks,
  memberPhotos,
  membershipRemovals,
  members,
  memberships,
  pickAudits,
  picks,
  resultAudits,
  sessions,
  textMessages,
  tiebreakerGuesses,
  type Member,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { joinFamily } from "@/lib/groups/memberships";
import { Refusal } from "@/lib/refusal";
import type { Commissioner } from "./authority";
import { cleanDisplayName, MAX_DISPLAY_NAME, MAX_PHONE } from "./limits";

/** A URL-safe secret for a Magic Link token or a session id. */
export function newSecret(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Deliberately not a `Refusal`: every console screen answers a
 * non-commissioner with `notFound()`, so a member who reaches one of these
 * must be told nothing rather than told what they may not do. It stays a
 * fault, and `consoleEdit` lets it through to the error page.
 */
export class NotCommissioner extends Error {
  constructor() {
    super("Only a commissioner can do that.");
  }
}

export class InvalidMember extends Refusal {}

/** A commissioner in good standing: the one definition, so no screen guesses. */
export function isCommissioner(member: Member): member is Commissioner {
  return member.isCommissioner && member.active;
}

/**
 * The brand's one check: refuses anyone who is not a commissioner in good
 * standing, and narrows `actor` to `Commissioner` for the rest of its
 * caller's scope. `requireConsole` and `asCommissioner` are its only two
 * callers — every other writer takes `Commissioner` as its parameter type
 * instead of calling this again.
 */
export function requireCommissioner(actor: Member): asserts actor is Commissioner {
  if (!isCommissioner(actor)) throw new NotCommissioner();
}

/** The roster order every screen reads in: as they joined, then by id. */
export const joinedOrder = [asc(members.joinedAt), asc(members.id)];

async function updateMember(
  db: Db,
  memberId: number,
  patch: Partial<typeof members.$inferInsert>,
): Promise<Member> {
  const [updated] = await db.update(members).set(patch).where(eq(members.id, memberId)).returning();
  if (!updated) throw new InvalidMember("No such member.");
  return updated;
}

export interface NewMemberInput {
  displayName: string;
  phone?: string | null;
}

/** The name and phone rules every way of adding a person shares. */
export function cleanInput(input: NewMemberInput): { displayName: string; phone: string | null } {
  const displayName = cleanDisplayName(input.displayName);
  if (displayName === null) {
    throw new InvalidMember(`Name must be between 1 and ${MAX_DISPLAY_NAME} characters.`);
  }
  const phone = input.phone?.trim() || null;
  if (phone && phone.length > MAX_PHONE) throw new InvalidMember("Phone number is too long.");
  return { displayName, phone };
}

/**
 * Seed-only entry point: creates a Commissioner with a fresh Magic Link
 * token, in Mabry Family. Console additions go through `addMember` in
 * `groups/console.ts`, which checks the actor and takes the group.
 */
export async function bootstrapCommissioner(db: Db, input: NewMemberInput): Promise<Member> {
  const clean = await freshInput(db, input);
  const [member] = await db
    .insert(members)
    .values({ ...clean, isCommissioner: true, token: newSecret() })
    .returning();
  await joinFamily(db, member, "organizer");
  return member;
}

/**
 * `cleanInput`, plus the refusal a phone number already in the app earns.
 * The unique constraint would refuse it too, but as a database error rather
 * than a sentence the console can show.
 */
async function freshInput(db: Db, input: NewMemberInput): Promise<ReturnType<typeof cleanInput>> {
  const clean = cleanInput(input);
  await refuseTakenPhone(db, clean.phone);
  return clean;
}

/**
 * The commissioner's refusal for a phone number someone else holds, naming
 * them: the console sees everyone, so there is nobody to protect by not saying.
 * An organizer's add refuses without the name (`addToGroup`). `self` is the
 * member being edited, who may save their own number again.
 */
export async function refuseTakenPhone(db: Db, phone: string | null, self?: number): Promise<void> {
  if (!phone) return;
  const holder = await db.query.members.findFirst({ where: eq(members.phone, phone) });
  if (holder && holder.id !== self) {
    throw new InvalidMember(`That phone number already belongs to ${holder.displayName}.`);
  }
}

/**
 * Sets or clears a member's phone number: how the commissioners fill in their
 * own, and how a changed number is fixed. Blank clears it, which is also how a
 * number entered on the wrong person is freed for the right one.
 */
export async function setPhone(db: Db, actor: Commissioner, memberId: number, phone: string): Promise<Member> {
  const clean = phone.trim() || null;
  if (clean && clean.length > MAX_PHONE) throw new InvalidMember("Phone number is too long.");
  await refuseTakenPhone(db, clean, memberId);
  return updateMember(db, memberId, { phone: clean });
}

/** The Magic Link: the app URL plus the member's secret token. */
export function magicLinkFor(member: Pick<Member, "token">, appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}/m/${member.token}`;
}

/**
 * Every member, commissioners and deactivated included, in the order they
 * joined. `actor` is the guard, not a value this reads: nothing here needs
 * it, only proof that a caller holds a `Commissioner`.
 */
export async function listMembers(db: Db, actor: Commissioner): Promise<Member[]> {
  return db.query.members.findMany({ orderBy: joinedOrder });
}

/**
 * Replaces the token so the old link stops working, and signs out every
 * device. When a commissioner regenerates their own link, pass the session
 * they are using so that device stays signed in and can copy the new link.
 */
export async function regenerateMagicLink(
  db: Db,
  actor: Commissioner,
  memberId: number,
  options: { keepSessionId?: string } = {},
): Promise<Member> {
  return renewToken(db, memberId, memberId === actor.id ? options.keepSessionId : undefined);
}

/**
 * The regenerate itself, with no check: `regenerateMagicLink` checks for the
 * console and `regenerateInGroup` for the Manage screen. `keepSessionId` is a
 * device of the actor's own that stays signed in.
 */
export async function renewToken(db: Db, memberId: number, keep?: string): Promise<Member> {
  // Neither write reads the other, so the caller waits for one round trip.
  const [, updated] = await Promise.all([
    db
      .delete(sessions)
      .where(keep ? and(eq(sessions.memberId, memberId), ne(sessions.id, keep)) : eq(sessions.memberId, memberId)),
    updateMember(db, memberId, { token: newSecret() }),
  ]);
  return updated;
}

/**
 * Flags a member who replied STOP, or clears the flag when they ask to hear
 * from the app again. The app hears no replies, so this is the commissioner
 * recording what a member told them.
 */
export async function setSmsOptedOut(db: Db, actor: Commissioner, memberId: number, optedOut: boolean): Promise<Member> {
  return updateMember(db, memberId, { smsOptedOut: optedOut });
}

/** Deactivating signs the member out everywhere and refuses their link until reactivated. */
export async function setMemberActive(
  db: Db,
  actor: Commissioner,
  memberId: number,
  active: boolean,
): Promise<Member> {
  if (!active && memberId === actor.id) throw new InvalidMember("You cannot deactivate yourself.");
  if (!active) await db.delete(sessions).where(eq(sessions.memberId, memberId));
  return updateMember(db, memberId, { active });
}

/**
 * How many Picks each member has, keyed by member id; a member with none is
 * absent. The console reads it next to the Delete button, so the sentence
 * before the click says what goes with them rather than the one after.
 * `actor` is the guard here too, as `listMembers`' is.
 */
export async function pickCountByMember(db: Db, actor: Commissioner): Promise<Map<number, number>> {
  const rows = await db.select({ memberId: picks.memberId, picks: count() }).from(picks).groupBy(picks.memberId);
  return new Map(rows.map((row) => [row.memberId, row.picks]));
}

/**
 * Deletes a member outright: the row, their sessions, their photo, their group
 * memberships, and every Pick, Lock, Tiebreaker Guess and change-log entry
 * about them. Deactivating keeps a
 * member on the boards they played (`roster.ts` says why); deleting is the
 * commissioner's decision to take them off, so the Leaderboard changes for
 * any Week they picked in. Two refusals:
 *
 * - The member must already be deactivated. Deactivating is reversible and
 *   deleting is not, so the second step is never one click from the first.
 * - A member whose console edits are on the record — a former commissioner
 *   who changed someone else's pick or a result — stays, because the log that
 *   names them is worth more than the row. Their own audits go with them.
 *
 * Every row that names them goes in one batch with the member, so a failure
 * leaves them whole rather than half deleted. That includes their Feedback
 * and its screenshots (#237), their Chat messages (#248), their reactions and
 * everyone's reactions to their messages (#249).
 */
export async function removeMember(db: Db, actor: Commissioner, memberId: number): Promise<Member> {
  if (memberId === actor.id) throw new InvalidMember("You cannot delete yourself.");
  const member = await db.query.members.findFirst({ where: eq(members.id, memberId) });
  if (!member) throw new InvalidMember("No such member.");
  if (member.active) throw new InvalidMember(`Deactivate ${member.displayName} first.`);
  if (await madeConsoleEdits(db, memberId)) {
    throw new InvalidMember(
      `${member.displayName} made commissioner edits that are on the record, so they cannot be deleted.`,
    );
  }
  const theirFeedback = db.select({ id: feedback.id }).from(feedback).where(eq(feedback.memberId, memberId));
  const theirMessages = db.select({ id: chatMessages.id }).from(chatMessages).where(eq(chatMessages.memberId, memberId));
  const writes = await inOneBatch(db, (tx) => [
    tx.delete(sessions).where(eq(sessions.memberId, memberId)),
    tx.delete(textMessages).where(eq(textMessages.memberId, memberId)),
    tx.delete(pickAudits).where(eq(pickAudits.memberId, memberId)),
    tx.delete(tiebreakerGuesses).where(eq(tiebreakerGuesses.memberId, memberId)),
    tx.delete(locks).where(eq(locks.memberId, memberId)),
    tx.delete(picks).where(eq(picks.memberId, memberId)),
    tx.delete(membershipRemovals).where(eq(membershipRemovals.memberId, memberId)),
    tx.delete(memberships).where(eq(memberships.memberId, memberId)),
    tx.delete(memberPhotos).where(eq(memberPhotos.memberId, memberId)),
    tx.delete(feedbackScreenshots).where(inArray(feedbackScreenshots.feedbackId, theirFeedback)),
    tx.delete(feedback).where(eq(feedback.memberId, memberId)),
    tx.delete(chatReactions).where(eq(chatReactions.memberId, memberId)),
    tx.delete(chatReactions).where(inArray(chatReactions.messageId, theirMessages)),
    tx.delete(chatMessages).where(eq(chatMessages.memberId, memberId)),
    // A message they took down stays down; it just no longer names who did it.
    tx.update(chatMessages).set({ removedBy: null }).where(eq(chatMessages.removedBy, memberId)),
    tx.delete(members).where(eq(members.id, memberId)).returning(),
  ]);
  const [deleted] = writes[15];
  return deleted;
}

/** Whether a row that is not the member's own names them as the one who changed it. */
async function madeConsoleEdits(db: Db, memberId: number): Promise<boolean> {
  const rows = await Promise.all([
    db
      .select({ n: count() })
      .from(picks)
      .where(and(ne(picks.memberId, memberId), eq(picks.updatedBy, memberId))),
    db
      .select({ n: count() })
      .from(locks)
      .where(and(ne(locks.memberId, memberId), eq(locks.updatedBy, memberId))),
    db
      .select({ n: count() })
      .from(tiebreakerGuesses)
      .where(and(ne(tiebreakerGuesses.memberId, memberId), eq(tiebreakerGuesses.updatedBy, memberId))),
    db
      .select({ n: count() })
      .from(pickAudits)
      .where(and(ne(pickAudits.memberId, memberId), eq(pickAudits.changedBy, memberId))),
    db.select({ n: count() }).from(resultAudits).where(eq(resultAudits.changedBy, memberId)),
  ]);
  return rows.some(([row]) => row.n > 0);
}
