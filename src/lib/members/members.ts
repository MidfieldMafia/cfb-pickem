import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq, ne } from "drizzle-orm";
import { members, sessions, type Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { Refusal } from "@/lib/refusal";
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
export function isCommissioner(member: Member): boolean {
  return member.isCommissioner && member.active;
}

/** Every console operation starts here. Server actions must call it too. */
export function requireCommissioner(actor: Member): void {
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

function cleanInput(input: NewMemberInput): { displayName: string; phone: string | null } {
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
 * token. Console additions go through `addMember`, which checks the actor.
 */
export async function bootstrapCommissioner(db: Db, input: NewMemberInput): Promise<Member> {
  const [member] = await db
    .insert(members)
    .values({ ...cleanInput(input), isCommissioner: true, token: newSecret() })
    .returning();
  return member;
}

/** The Magic Link: the app URL plus the member's secret token. */
export function magicLinkFor(member: Pick<Member, "token">, appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}/m/${member.token}`;
}

export async function addMember(db: Db, actor: Member, input: NewMemberInput): Promise<Member> {
  requireCommissioner(actor);
  const [member] = await db
    .insert(members)
    .values({ ...cleanInput(input), token: newSecret() })
    .returning();
  return member;
}

/** Every member, commissioners and deactivated included, in the order they joined. */
export async function listMembers(db: Db, actor: Member): Promise<Member[]> {
  requireCommissioner(actor);
  return db.query.members.findMany({ orderBy: joinedOrder });
}

/**
 * Replaces the token so the old link stops working, and signs out every
 * device. When a commissioner regenerates their own link, pass the session
 * they are using so that device stays signed in and can copy the new link.
 */
export async function regenerateMagicLink(
  db: Db,
  actor: Member,
  memberId: number,
  options: { keepSessionId?: string } = {},
): Promise<Member> {
  requireCommissioner(actor);
  const keep = memberId === actor.id ? options.keepSessionId : undefined;
  // Neither write reads the other, so the commissioner waits for one round trip.
  const [, updated] = await Promise.all([
    db
      .delete(sessions)
      .where(keep ? and(eq(sessions.memberId, memberId), ne(sessions.id, keep)) : eq(sessions.memberId, memberId)),
    updateMember(db, memberId, { token: newSecret() }),
  ]);
  return updated;
}

/** Deactivating signs the member out everywhere and refuses their link until reactivated. */
export async function setMemberActive(
  db: Db,
  actor: Member,
  memberId: number,
  active: boolean,
): Promise<Member> {
  requireCommissioner(actor);
  if (!active && memberId === actor.id) throw new InvalidMember("You cannot deactivate yourself.");
  if (!active) await db.delete(sessions).where(eq(sessions.memberId, memberId));
  return updateMember(db, memberId, { active });
}
