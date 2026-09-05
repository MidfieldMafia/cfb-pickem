import { eq } from "drizzle-orm";
import { members, sessions, type Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { findAvatar } from "@/lib/avatars";
import { newSecret } from "./token";

/** Where a fresh sign-in goes: the welcome page until it has been completed once. */
export type Landing = "welcome" | "week";

export interface SignIn {
  sessionId: string;
  member: Member;
  landing: Landing;
}

export function landingFor(member: Member): Landing {
  return member.welcomedAt ? "week" : "welcome";
}

/** Trades a Magic Link token for a session. Null when the link is unknown or the member is deactivated. */
export async function exchangeToken(db: Db, token: string): Promise<SignIn | null> {
  const member = await db.query.members.findFirst({ where: eq(members.token, token) });
  if (!member || !member.active) return null;
  const sessionId = newSecret();
  const now = new Date();
  await db.insert(sessions).values({ id: sessionId, memberId: member.id, lastSeenAt: now });
  await db.update(members).set({ lastSeenAt: now }).where(eq(members.id, member.id));
  return { sessionId, member: { ...member, lastSeenAt: now }, landing: landingFor(member) };
}

/** The member behind a session cookie, or null when the session is gone or the member is deactivated. */
export async function getSession(db: Db, sessionId: string): Promise<Member | null> {
  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
    with: { member: true },
  });
  if (!session || !session.member.active) return null;
  return session.member;
}

export class InvalidWelcome extends Error {}

/** The welcome page: a display name and one of the fixed pennants. */
export async function completeWelcome(
  db: Db,
  member: Member,
  input: { displayName: string; avatarId: string },
): Promise<Member> {
  const displayName = input.displayName.trim();
  if (displayName.length === 0 || displayName.length > 40) {
    throw new InvalidWelcome("Pick a name between 1 and 40 characters.");
  }
  if (!findAvatar(input.avatarId)) {
    throw new InvalidWelcome("Pick one of the pennants.");
  }
  const [updated] = await db
    .update(members)
    .set({ displayName, avatarId: input.avatarId, welcomedAt: member.welcomedAt ?? new Date() })
    .where(eq(members.id, member.id))
    .returning();
  return updated;
}
