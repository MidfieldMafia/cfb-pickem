/**
 * How people get into groups without anyone adding them, and out again: a
 * group's Join Link, starting a group, and leaving one.
 *
 * Nobody here is checked against a role. Whoever holds a Join Link may use it,
 * and anyone may start a group, so the rules that remain are about the *person*:
 * one phone number is one person (a number already in the app is sent to its
 * own Magic Link rather than becoming a second copy of someone), a removed
 * member waits for an organizer (#136), and a group that has organizers is never
 * left without one by its last one walking out.
 *
 * A signed-out arrival comes back with a session id, so the screen can set the
 * cookie that `exchangeToken` would have set from a Magic Link — and it is
 * `exchangeToken` that makes it, so there is one way a session begins.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { groups, membershipRemovals, members, memberships, type Group, type Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { findAvatar } from "@/lib/avatars";
import { exchangeToken } from "@/lib/members/auth";
import { cleanDisplayName, MAX_DISPLAY_NAME, MAX_PHONE } from "@/lib/members/limits";
import { isCommissioner, newSecret } from "@/lib/members/members";
import { cleanGroupName, MAX_GROUP_NAME } from "./limits";
import { anotherOrganizer, endAbsence, InvalidGroup, openAbsence } from "./manage";
import { groupRoster } from "./memberships";

/** A Join Link: the app URL plus the group's token, on a path of its own. */
export function joinLinkFor(group: Pick<Group, "joinToken">, appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}/join/${group.joinToken}`;
}

/** The group a Join Link opens, or null for a link that was reset or never was. */
export async function groupForJoinLink(db: Db, token: string): Promise<Group | null> {
  return (await db.query.groups.findFirst({ where: eq(groups.joinToken, token) })) ?? null;
}

/**
 * Where a person stands with a group, which decides what its Join Link offers
 * them: nothing to do, a one-tap join or rejoin, or the refusal.
 */
export type JoinStanding = "in" | "left" | "removed" | "never";

export async function joinStanding(db: Db, memberId: number, groupId: number): Promise<JoinStanding> {
  const entry = (await groupRoster(db, groupId)).find((e) => e.member.id === memberId);
  if (!entry) return "never";
  return openAbsence(entry)?.kind ?? "in";
}

/** Someone setting themselves up: what the welcome page asks, plus a phone number. */
export interface NewPerson {
  displayName: string;
  phone: string;
  avatarId: string;
}

/** A person who just set themselves up, in `group`, with a session to sign them in. */
export interface Arrival {
  member: Member;
  group: Group;
  sessionId: string;
}

const RESET = "This link was reset. Ask your organizer for the new one.";

async function linkedGroup(db: Db, token: string): Promise<Group> {
  const group = await groupForJoinLink(db, token);
  if (!group) throw new InvalidGroup(RESET);
  return group;
}

/**
 * The checks a new person passes before anything is written, so a refusal
 * leaves no half-made person behind. `taken` is the sentence for a phone number
 * already in the app, which differs by where they were headed.
 */
async function cleanPerson(db: Db, person: NewPerson, taken: string): Promise<NewPerson> {
  const displayName = cleanDisplayName(person.displayName);
  if (displayName === null) throw new InvalidGroup(`Pick a name between 1 and ${MAX_DISPLAY_NAME} characters.`);
  const phone = person.phone.trim();
  if (!phone) throw new InvalidGroup("Enter your phone number.");
  if (phone.length > MAX_PHONE) throw new InvalidGroup("That phone number is too long.");
  if (!findAvatar(person.avatarId)) throw new InvalidGroup("Pick one of the pennants.");
  if (await db.query.members.findFirst({ where: eq(members.phone, phone) })) throw new InvalidGroup(taken);
  return { displayName, phone, avatarId: person.avatarId };
}

/**
 * Writes the person and signs them in. They chose their name and pennant on the
 * way in, so the welcome page counts as done and their Magic Link opens straight
 * onto the boards.
 */
async function arrive(db: Db, person: NewPerson, now: Date): Promise<{ member: Member; sessionId: string }> {
  const [created] = await db
    .insert(members)
    .values({ ...person, token: newSecret(), joinedAt: now, welcomedAt: now })
    .returning();
  const signIn = await exchangeToken(db, created.token);
  // Only a deactivated or vanished member has no sign-in, and this one was just made.
  if (!signIn) throw new Error(`Member ${created.id} could not be signed in.`);
  return signIn;
}

/**
 * The Join Link, signed out: a new person, in the group as of now. A phone
 * number already in the app is refused without saying whose: that person texts
 * themselves their own link (#142), opens it, then opens this one, and joins signed in.
 */
export async function joinSignedOut(db: Db, token: string, person: NewPerson, now: Date = new Date()): Promise<Arrival> {
  const group = await linkedGroup(db, token);
  const clean = await cleanPerson(
    db,
    person,
    "This number already plays in another group. Text yourself your link below, open it, then open this link again.",
  );
  const { member, sessionId } = await arrive(db, clean, now);
  await db.insert(memberships).values({ groupId: group.id, memberId: member.id, role: "member", joinedAt: now });
  return { member, group, sessionId };
}

/**
 * The Join Link, signed in. Someone already in the group is simply in it.
 * Someone who left rejoins with their original joined-at, so everything they had
 * returns; someone removed is refused, because only an organizer or commissioner
 * brings them back (#136). Anyone else joins as of now, so no earlier Week
 * counts for them here.
 */
export async function joinSignedIn(db: Db, member: Member, token: string, now: Date = new Date()): Promise<Group> {
  const group = await linkedGroup(db, token);
  switch (await joinStanding(db, member.id, group.id)) {
    case "in":
      return group;
    case "removed":
      throw new InvalidGroup(`You were removed from ${group.name}. Ask your organizer to add you back.`);
    case "left":
      await endAbsence(db, group.id, member.id, now);
      return group;
    case "never":
      await db.insert(memberships).values({ groupId: group.id, memberId: member.id, role: "member", joinedAt: now });
      return group;
  }
}

function cleanName(name: string): string {
  const clean = cleanGroupName(name);
  if (clean === null) throw new InvalidGroup(`A group name is 1 to ${MAX_GROUP_NAME} characters.`);
  return clean;
}

async function found(db: Db, name: string, founder: Member, now: Date): Promise<Group> {
  const [group] = await db.insert(groups).values({ name, joinToken: newSecret(), createdAt: now }).returning();
  await db.insert(memberships).values({ groupId: group.id, memberId: founder.id, role: "organizer", joinedAt: now });
  return group;
}

/**
 * Starting a group signed out: a new person, and a new group they organize.
 * No cap or rate limit (spec #130). Every check runs before the first write.
 */
export async function startGroupSignedOut(
  db: Db,
  groupName: string,
  person: NewPerson,
  now: Date = new Date(),
): Promise<Arrival> {
  const name = cleanName(groupName);
  const clean = await cleanPerson(
    db,
    person,
    "This number already plays in another group. Text yourself your link below, open it, then start your group from there.",
  );
  const { member, sessionId } = await arrive(db, clean, now);
  return { member, group: await found(db, name, member, now), sessionId };
}

/**
 * Starting a group signed in: the founder organizes it, joined now, and keeps
 * every group they were already in. A commissioner starting one here joins it,
 * unlike the console's `createGroup`.
 */
export async function startGroupSignedIn(db: Db, member: Member, groupName: string, now: Date = new Date()): Promise<Group> {
  return found(db, cleanName(groupName), member, now);
}

/**
 * Leaving a group: off its boards, past weeks included, exactly as a removal is,
 * and nothing deleted, so opening the Join Link again brings everything back.
 * The last organizer of a group may not leave it; a commissioner may, because
 * commissioners run every group whether it has an organizer or not.
 */
export async function leaveGroup(db: Db, member: Member, groupId: number, now: Date = new Date()): Promise<Group> {
  const group = await db.query.groups.findFirst({ where: eq(groups.id, groupId) });
  if (!group) throw new InvalidGroup("No such group.");
  const entry = (await groupRoster(db, groupId)).find((e) => e.member.id === member.id);
  if (!entry || openAbsence(entry)) throw new InvalidGroup(`You are not in ${group.name}.`);
  if (entry.role === "organizer" && !isCommissioner(member) && !(await anotherOrganizer(db, groupId, member.id))) {
    throw new InvalidGroup("Make someone else an organizer before you leave.");
  }
  await db.insert(membershipRemovals).values({ groupId, memberId: member.id, removedAt: now, kind: "left" });
  return group;
}
