/**
 * Running a group: the Manage screen's reads and edits, and the one check they
 * all start from. An organizer manages their own group; a commissioner manages
 * every group and passes every organizer check.
 *
 * Every edit takes a `Manager`, and `manageGroup` is the only way to get one,
 * the way `Commissioner` is minted only by `requireConsole` and
 * `asCommissioner`. So no edit re-checks the actor, and none can be reached
 * without the check having run.
 *
 * What an organizer may never do is as much the point as what they may: see a
 * team or a guess before the Reveal, copy a Magic Link they did not just make,
 * or touch another organizer. Those limits live here, not in what the screen
 * chooses to draw, because a Server Action is reachable by anyone who can post.
 */
import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { groups, membershipRemovals, members, memberships, type Group, type Member, type MembershipRole } from "@/db/schema";
import type { Db } from "@/db/types";
import {
  cleanInput,
  InvalidMember,
  isCommissioner,
  joinedOrder,
  newSecret,
  refuseTakenPhone,
  renewToken,
  type NewMemberInput,
} from "@/lib/members/members";
import { owed, weekProgress } from "@/lib/picks/console";
import { publishedDeadline } from "@/lib/picks/picks";
import { Refusal } from "@/lib/refusal";
import { deadlinePassed, publishedSlate } from "@/lib/slate/slate";
import { cleanGroupName, MAX_GROUP_NAME } from "./limits";
import { groupRoster, memberGroups, type Absence, type RosterEntry } from "./memberships";

/**
 * Deliberately not a `Refusal`, for the reason `NotCommissioner` is not: the
 * Manage screen answers someone who does not run the group with `notFound()`,
 * so reaching an edit without the right is a fault, not a sentence to show.
 */
export class NotOrganizer extends Error {
  constructor() {
    super("Only the group's organizers can do that.");
  }
}

/** A Manage edit that cannot be done as asked, in a sentence for the screen. */
export class InvalidGroup extends Refusal {}

/** The acting member, proven to run `group`. */
export interface Manager {
  readonly actor: Member;
  readonly group: Group;
  /** True when they run it as a commissioner: every power, and the picks in view. */
  readonly commissioner: boolean;
  readonly __manager: unique symbol;
}

/** The one cast to `Manager`, reached only after `manageGroup`'s check. */
const mint = (manager: Omit<Manager, "__manager">) => manager as Manager;

/** Out of the group right now: a removal nobody has undone. */
function stillOut(entry: RosterEntry): boolean {
  return entry.removals.some((period) => period.restoredAt === null);
}

/** The period they are out for now, if they are: a removal, or having left. */
export function openAbsence(entry: RosterEntry): Absence | undefined {
  return entry.removals.find((period) => period.restoredAt === null);
}

/**
 * The check every Manage read and edit starts from. A commissioner in good
 * standing manages any group, member of it or not; anyone else only a group
 * they organize now — a removed organizer runs nothing.
 */
export async function manageGroup(db: Db, actor: Member, groupId: number): Promise<Manager> {
  const group = await db.query.groups.findFirst({ where: eq(groups.id, groupId) });
  if (!group) throw new NotOrganizer();
  if (isCommissioner(actor)) return mint({ actor, group, commissioner: true });
  if (!actor.active) throw new NotOrganizer();
  const own = (await groupRoster(db, groupId)).find((entry) => entry.member.id === actor.id);
  if (!own || own.role !== "organizer" || stillOut(own)) throw new NotOrganizer();
  return mint({ actor, group, commissioner: false });
}

/** One member's standing on the Week, with nothing that says what they picked. */
export interface Reminder {
  picksMade: number;
  liveGames: number;
  lockSet: boolean;
  guessSet: boolean;
  /** "Done", or "Missing 10 picks, Lock of the Week, Tiebreaker Guess". */
  status: string;
}

/** A member as the Manage screen lists them. Never the token: see `addToGroup`. */
export interface ManagedMember {
  id: number;
  displayName: string;
  avatarId: string | null;
  phone: string | null;
  role: MembershipRole;
  commissioner: boolean;
  active: boolean;
  /** Null for a deactivated member, and when no Week is published. */
  reminder: Reminder | null;
  /** A commissioner's view only: the counting Lock's team and the guess. */
  revealed?: { lockTeam: string | null; guess: number | null };
}

export interface ManageView {
  group: { id: number; name: string };
  /** The Week the reminder view counts, or null before any is published. */
  week: { number: number; deadline: Date; locked: boolean } | null;
  /** In the group now, in the order they joined it. */
  members: ManagedMember[];
  /** Removed and not restored, for the Restore buttons. */
  removed: RemovedMember[];
  /**
   * Everyone a commissioner could add who has never been in the group, in the
   * order they joined the app. Always empty for an organizer, who never reaches
   * people outside their group: theirs come in through the Join Link.
   */
  addable: { id: number; displayName: string }[];
}

export interface RemovedMember {
  id: number;
  displayName: string;
  avatarId: string | null;
  removedAt: Date;
}

/**
 * The Manage screen's data. The rows are built field by field rather than
 * spread from the member and the progress, so a column added to either later
 * reaches an organizer only by someone writing it in here.
 */
export async function manageView(db: Db, manager: Manager, now: Date = new Date()): Promise<ManageView> {
  const [entries, slate, everyone] = await Promise.all([
    groupRoster(db, manager.group.id),
    publishedSlate(db),
    manager.commissioner ? db.query.members.findMany({ where: eq(members.active, true), orderBy: joinedOrder }) : [],
  ]);
  // Someone who left can be added back; someone removed is restored from the Removed list.
  const inGroup = new Set(entries.filter((entry) => openAbsence(entry)?.kind !== "left").map((entry) => entry.member.id));
  const current = entries.filter((entry) => !stillOut(entry));
  const players = current.filter((entry) => entry.member.active).map((entry) => entry.member);
  const progress = slate ? await weekProgress(db, slate, players) : [];
  const progressOf = new Map(progress.map((row) => [row.member.id, row]));

  const rows = current.map(({ member, role }): ManagedMember => {
    const row = progressOf.get(member.id);
    const managed: ManagedMember = {
      id: member.id,
      displayName: member.displayName,
      avatarId: member.avatarId,
      phone: member.phone,
      role,
      commissioner: member.isCommissioner,
      active: member.active,
      reminder: row
        ? {
            picksMade: row.progress.picksMade,
            liveGames: row.progress.liveGames,
            lockSet: row.progress.lockSet,
            guessSet: row.progress.guessSet,
            status: row.complete ? "Done" : `Missing ${owed(row).join(", ")}`,
          }
        : null,
    };
    if (manager.commissioner && row) managed.revealed = { lockTeam: row.lockTeam, guess: row.tiebreakerGuess };
    return managed;
  });

  return {
    group: { id: manager.group.id, name: manager.group.name },
    week: slate
      ? {
          number: slate.week.weekNumber,
          deadline: publishedDeadline(slate.week),
          locked: deadlinePassed(slate.week, now),
        }
      : null,
    members: rows,
    // Only removals: someone who left rejoins through the Join Link, so there is
    // nothing here for an organizer to restore (#136).
    removed: entries.flatMap((entry) => {
      const { member } = entry;
      const open = openAbsence(entry);
      return open?.kind === "removed"
        ? [{ id: member.id, displayName: member.displayName, avatarId: member.avatarId, removedAt: open.removedAt }]
        : [];
    }),
    addable: everyone
      .filter((person) => !inGroup.has(person.id))
      .map((person) => ({ id: person.id, displayName: person.displayName })),
  };
}

/**
 * Adds someone new to the group by name and phone number, both required, and
 * hands back the person with their token so the screen can show the Magic Link
 * this once. Nothing reads the token for an organizer again.
 *
 * A phone number already in the app is refused without naming whose it is: the
 * person behind it may play only in groups this organizer cannot see, and
 * connecting to them is the Join Link's job, which they open themselves. A
 * commissioner sees everyone, so theirs is told the name and can add that
 * person with `addExistingToGroup` instead.
 */
export async function addToGroup(db: Db, manager: Manager, input: NewMemberInput, now: Date = new Date()): Promise<Member> {
  if (!input.phone?.trim()) throw new InvalidMember("Enter their phone number.");
  const clean = cleanInput(input);
  if (manager.commissioner) {
    await refuseTakenPhone(db, clean.phone);
  } else if (await db.query.members.findFirst({ where: eq(members.phone, clean.phone!) })) {
    throw new InvalidMember("They already play in another group; send them your Join Link.");
  }
  const [member] = await db
    .insert(members)
    .values({ ...clean, token: newSecret(), joinedAt: now })
    .returning();
  await db.insert(memberships).values({ groupId: manager.group.id, memberId: member.id, role: "member", joinedAt: now });
  return member;
}

/**
 * Puts someone already in the app into the group, joined now, so no Week before
 * today counts for them here. A commissioner's power only: an organizer never
 * reaches a person outside their group, so reaching this as one is a fault, as
 * reaching the screen is. Someone removed from the group is restored instead,
 * which keeps their original joined-at and so everything they had.
 */
export async function addExistingToGroup(db: Db, manager: Manager, memberId: number, now: Date = new Date()): Promise<Member> {
  if (!manager.commissioner) throw new NotOrganizer();
  const person = await db.query.members.findFirst({ where: eq(members.id, memberId) });
  if (!person) throw new InvalidMember("No such member.");
  const entry = (await groupRoster(db, manager.group.id)).find((e) => e.member.id === memberId);
  const absence = entry && openAbsence(entry);
  if (absence?.kind === "removed") {
    throw new InvalidGroup(`${person.displayName} was removed from ${manager.group.name}; restore them instead.`);
  }
  // Left on their own: back with their original joined-at, as the Join Link would do.
  if (absence) {
    await endAbsence(db, manager.group.id, memberId, now);
    return person;
  }
  if (entry) throw new InvalidGroup(`${person.displayName} is already in ${manager.group.name}.`);
  await db.insert(memberships).values({ groupId: manager.group.id, memberId, role: "member", joinedAt: now });
  return person;
}

/** The target's membership in the manager's group, refused when there is none. */
async function membershipIn(db: Db, manager: Manager, memberId: number): Promise<RosterEntry & { out: boolean }> {
  const entry = (await groupRoster(db, manager.group.id)).find((e) => e.member.id === memberId);
  if (!entry) throw new InvalidGroup(`They are not in ${manager.group.name}.`);
  return { ...entry, out: stillOut(entry) };
}

/** In the group now, refused when they are not or are removed. */
async function currentIn(db: Db, manager: Manager, memberId: number): Promise<RosterEntry> {
  const entry = await membershipIn(db, manager, memberId);
  if (entry.out) throw new InvalidGroup(`They are not in ${manager.group.name}.`);
  return entry;
}

/**
 * Removes a member from the group: they disappear from every screen of it, past
 * weeks included, and nothing is deleted, so `restoreToGroup` undoes it whole.
 * An organizer removes members only; a commissioner anyone.
 */
export async function removeFromGroup(db: Db, manager: Manager, memberId: number, now: Date = new Date()): Promise<Member> {
  const entry = await currentIn(db, manager, memberId);
  if (entry.role === "organizer" && !manager.commissioner) {
    throw new InvalidGroup(`${entry.member.displayName} is an organizer, so they stay.`);
  }
  await db.insert(membershipRemovals).values({ groupId: manager.group.id, memberId, removedAt: now });
  return entry.member;
}

/**
 * Brings a removed member back. The membership kept its joined-at, so their
 * results in the group return, weekly wins included; a Week whose Deadline fell
 * while they were out stays uncounted.
 */
export async function restoreToGroup(db: Db, manager: Manager, memberId: number, now: Date = new Date()): Promise<Member> {
  const entry = await membershipIn(db, manager, memberId);
  if (!entry.out) throw new InvalidGroup(`${entry.member.displayName} is not removed.`);
  if (openAbsence(entry)?.kind === "left") {
    throw new InvalidGroup(`${entry.member.displayName} left on their own; they rejoin through the Join Link.`);
  }
  await endAbsence(db, manager.group.id, memberId, now);
  return entry.member;
}

/** Closes the member's open absence from the group, however it began. */
export async function endAbsence(db: Db, groupId: number, memberId: number, now: Date): Promise<void> {
  await db
    .update(membershipRemovals)
    .set({ restoredAt: now })
    .where(
      and(
        eq(membershipRemovals.groupId, groupId),
        eq(membershipRemovals.memberId, memberId),
        isNull(membershipRemovals.restoredAt),
      ),
    );
}

async function setRole(db: Db, manager: Manager, memberId: number, role: MembershipRole): Promise<void> {
  await db
    .update(memberships)
    .set({ role })
    .where(and(eq(memberships.groupId, manager.group.id), eq(memberships.memberId, memberId)));
}

/** Makes a member of the group an organizer. */
export async function promoteInGroup(db: Db, manager: Manager, memberId: number): Promise<Member> {
  const entry = await currentIn(db, manager, memberId);
  if (entry.role === "organizer") throw new InvalidGroup(`${entry.member.displayName} is already an organizer.`);
  await setRole(db, manager, memberId, "organizer");
  return entry.member;
}

/**
 * Makes an organizer a member again. An organizer demotes only themselves, and
 * only while another organizer remains, so a group that has organizers is never
 * left without one by its own. A commissioner demotes anyone, the last included:
 * a commissioner is always in charge of every group.
 */
export async function demoteInGroup(db: Db, manager: Manager, memberId: number): Promise<Member> {
  const entry = await currentIn(db, manager, memberId);
  if (entry.role !== "organizer") throw new InvalidGroup(`${entry.member.displayName} is not an organizer.`);
  if (!manager.commissioner) {
    if (memberId !== manager.actor.id) {
      throw new InvalidGroup(`Only ${entry.member.displayName} can step down as an organizer.`);
    }
    if (!(await anotherOrganizer(db, manager.group.id, memberId))) {
      throw new InvalidGroup("Make someone else an organizer before you step down.");
    }
  }
  await setRole(db, manager, memberId, "member");
  return entry.member;
}

/**
 * Whether the group has an organizer besides `memberId` who can still run it:
 * in the group now and not deactivated. Exported for leaving a group, which
 * the same rule binds.
 */
export async function anotherOrganizer(db: Db, groupId: number, memberId: number): Promise<boolean> {
  const entries = await groupRoster(db, groupId);
  return entries.some(
    (e) => e.member.id !== memberId && e.role === "organizer" && e.member.active && !stillOut(e),
  );
}

/**
 * A new Magic Link: the old one stops working and every device signs out. An
 * organizer may only do it for a member (not an organizer) whose only group is
 * this one, so they can never lock someone out of a group they cannot see. A
 * commissioner may for anyone, and keeps their own device signed in.
 */
export async function regenerateInGroup(
  db: Db,
  manager: Manager,
  memberId: number,
  options: { keepSessionId?: string } = {},
): Promise<Member> {
  const entry = await currentIn(db, manager, memberId);
  const name = entry.member.displayName;
  if (!manager.commissioner) {
    if (entry.role === "organizer") {
      throw new InvalidGroup(`${name} is an organizer; a commissioner can make them a new link.`);
    }
    if (entry.member.isCommissioner) {
      throw new InvalidGroup(`${name} is a commissioner and makes their own new link.`);
    }
    const theirs = await memberGroups(db, memberId);
    if (theirs.some((g) => g.group.id !== manager.group.id)) {
      throw new InvalidGroup(`${name} plays in another group too; a commissioner can make them a new link.`);
    }
  }
  return renewToken(db, memberId, memberId === manager.actor.id ? options.keepSessionId : undefined);
}

/**
 * A new Join Link token: the old link stops working and lands on the "this link
 * was reset" page. Nobody already in the group is touched.
 */
export async function resetJoinLink(db: Db, manager: Manager): Promise<Group> {
  const [reset] = await db
    .update(groups)
    .set({ joinToken: newSecret() })
    .where(eq(groups.id, manager.group.id))
    .returning();
  return reset;
}

/** Renames the group. Names need not be unique. */
export async function renameGroup(db: Db, manager: Manager, name: string): Promise<Group> {
  const clean = cleanGroupName(name);
  if (clean === null) throw new InvalidGroup(`A group name is 1 to ${MAX_GROUP_NAME} characters.`);
  const [renamed] = await db.update(groups).set({ name: clean }).where(eq(groups.id, manager.group.id)).returning();
  return renamed;
}
