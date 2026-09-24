/**
 * The commissioner's view over every group, for the console: the Groups list,
 * starting a group without joining it, deleting one, and adding a new person to
 * the group they choose. Every function takes a `Commissioner`, so none is
 * reachable without the console's own check having run.
 *
 * Running any one group — its people, organizers, links and name — is the
 * Manage screen's, which a commissioner opens for any group from the list.
 */
import "server-only";
import { asc, eq, inArray, isNull } from "drizzle-orm";
import { chatMessages, chatReactions, groups, membershipRemovals, members, memberships, type Group, type Member, type MembershipRole } from "@/db/schema";
import type { Db } from "@/db/types";
import type { Commissioner } from "@/lib/members/authority";
import { newSecret, type NewMemberInput } from "@/lib/members/members";
import { cleanGroupName, MAX_GROUP_NAME } from "./limits";
import { addToGroup, InvalidGroup, manageGroup } from "./manage";

export interface GroupSummary {
  id: number;
  name: string;
  /** In the group now: a removed member is not counted. */
  members: number;
  /** Names of its organizers in the group now, in the order they joined it. */
  organizers: string[];
  /** Who would be in no group at all if this one were deleted. */
  leftWithoutGroup: number;
}

/** A group a person is in now, as the Members page lists it. */
export interface GroupOfMember {
  id: number;
  name: string;
  role: MembershipRole;
}

interface Standing {
  groupId: number;
  member: Pick<Member, "id" | "displayName">;
  role: MembershipRole;
}

/**
 * Every membership that stands right now, across every group, in the order
 * members joined each group. One read of the three tables, for the two console
 * screens that see all groups at once, rather than a `groupRoster` per group.
 */
async function standing(db: Db): Promise<Standing[]> {
  const [rows, open] = await Promise.all([
    db
      .select({
        groupId: memberships.groupId,
        member: { id: members.id, displayName: members.displayName },
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(members, eq(members.id, memberships.memberId))
      .orderBy(asc(memberships.joinedAt), asc(members.id)),
    db
      .select({ groupId: membershipRemovals.groupId, memberId: membershipRemovals.memberId })
      .from(membershipRemovals)
      .where(isNull(membershipRemovals.restoredAt)),
  ]);
  const out = new Set(open.map((r) => `${r.groupId}:${r.memberId}`));
  return rows.filter((row) => !out.has(`${row.groupId}:${row.member.id}`));
}

/** How many groups each member is in now, keyed by member id. */
function groupCounts(rows: Standing[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const row of rows) counts.set(row.member.id, (counts.get(row.member.id) ?? 0) + 1);
  return counts;
}

/** Every group, oldest first, with what the console's list shows about each. */
export async function listGroups(db: Db, _actor: Commissioner): Promise<GroupSummary[]> {
  const [all, rows] = await Promise.all([db.query.groups.findMany({ orderBy: asc(groups.id) }), standing(db)]);
  const counts = groupCounts(rows);
  return all.map((group) => {
    const own = rows.filter((row) => row.groupId === group.id);
    return {
      id: group.id,
      name: group.name,
      members: own.length,
      organizers: own.filter((row) => row.role === "organizer").map((row) => row.member.displayName),
      leftWithoutGroup: own.filter((row) => counts.get(row.member.id) === 1).length,
    };
  });
}

/**
 * Each person's groups now, keyed by member id, oldest group first; a person in
 * none is absent. `_actor` is the guard, as `listMembers`' is.
 */
export async function groupsByMember(db: Db, _actor: Commissioner): Promise<Map<number, GroupOfMember[]>> {
  const [all, rows] = await Promise.all([db.query.groups.findMany({ orderBy: asc(groups.id) }), standing(db)]);
  const byMember = new Map<number, GroupOfMember[]>();
  for (const group of all) {
    for (const row of rows.filter((r) => r.groupId === group.id)) {
      byMember.set(row.member.id, [
        ...(byMember.get(row.member.id) ?? []),
        { id: group.id, name: group.name, role: row.role },
      ]);
    }
  }
  return byMember;
}

/**
 * Starts a group from the console. The commissioner does not join it, so it may
 * have no organizer: commissioners manage every group, so it is never left
 * without someone in charge. It gets its own Join Link token from the start.
 */
export async function createGroup(db: Db, actor: Commissioner, name: string): Promise<Group> {
  const clean = cleanGroupName(name);
  if (clean === null) throw new InvalidGroup(`A group name is 1 to ${MAX_GROUP_NAME} characters.`);
  const [group] = await db.insert(groups).values({ name: clean, joinToken: newSecret() }).returning();
  return group;
}

/**
 * Deletes a group, its Chat thread and its reactions, and every membership it has had. People are not touched: their
 * rows, Picks and Magic Links stay, and anyone it was the last group of sees the
 * "not in a group yet" screen. Their other groups are untouched.
 *
 * Nothing about it can be undone — a membership's joined-at is what decides
 * which Weeks count, and it goes — so the group's name has to be typed exactly.
 *
 * No transactions on the Neon HTTP driver, so the writes go children first and
 * the group row last: a failure midway leaves a group that can be deleted again.
 */
export async function deleteGroup(
  db: Db,
  actor: Commissioner,
  groupId: number,
  confirm: string,
): Promise<{ name: string; leftWithoutGroup: number }> {
  const summary = (await listGroups(db, actor)).find((group) => group.id === groupId);
  if (!summary) throw new InvalidGroup("No such group.");
  if (confirm.trim() !== summary.name) throw new InvalidGroup(`Type ${summary.name} to delete it.`);
  const itsMessages = db.select({ id: chatMessages.id }).from(chatMessages).where(eq(chatMessages.groupId, groupId));
  await db.delete(chatReactions).where(inArray(chatReactions.messageId, itsMessages));
  await db.delete(chatMessages).where(eq(chatMessages.groupId, groupId));
  await db.delete(membershipRemovals).where(eq(membershipRemovals.groupId, groupId));
  await db.delete(memberships).where(eq(memberships.groupId, groupId));
  await db.delete(groups).where(eq(groups.id, groupId));
  return { name: summary.name, leftWithoutGroup: summary.leftWithoutGroup };
}

/**
 * Adds someone new to the group the commissioner chose, by name and phone
 * number, both required. The same add as the Manage screen's, run with
 * commissioner powers: a phone number already in the app is refused naming
 * whose it is.
 */
export async function addMember(
  db: Db,
  actor: Commissioner,
  groupId: number,
  input: NewMemberInput,
  now: Date = new Date(),
): Promise<Member> {
  return addToGroup(db, await manageGroup(db, actor, groupId), input, now);
}
