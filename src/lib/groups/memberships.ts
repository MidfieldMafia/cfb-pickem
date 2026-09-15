/**
 * Who is in which group. The read side the group-scoped boards build on: a
 * member's groups, and a group's roster with every membership's role,
 * joined-at, and removal periods. No screen reads it yet.
 *
 * The roster is the data, not a board. It keeps deactivated members, members
 * who joined after some Deadline, and members removed from the group, each
 * with what the board needs to decide about them; deciding stays with
 * `members/roster.ts` and the scoring engine's `playedWeek`.
 */
import "server-only";
import { and, asc, eq, isNull, notExists } from "drizzle-orm";
import {
  groups,
  membershipRemovals,
  memberships,
  members,
  type Group,
  type Member,
  type MembershipRole,
} from "@/db/schema";
import type { Db } from "@/db/types";

/** The family's group, created by the migration that introduced groups. */
export const MABRY_FAMILY = "Mabry Family";

/** A period the member was out of the group. `restoredAt` is null while they still are. */
export interface RemovalPeriod {
  removedAt: Date;
  restoredAt: Date | null;
}

export interface MemberGroup {
  group: Group;
  role: MembershipRole;
  joinedAt: Date;
}

export interface RosterEntry {
  member: Member;
  role: MembershipRole;
  joinedAt: Date;
  /** Oldest first. */
  removals: RemovalPeriod[];
}

/**
 * The groups a member is in now, in the order they joined them. A group they
 * have been removed from and not restored to is left out: they are not in it.
 */
export async function memberGroups(db: Db, memberId: number): Promise<MemberGroup[]> {
  const stillOut = db
    .select({ id: membershipRemovals.id })
    .from(membershipRemovals)
    .where(
      and(
        eq(membershipRemovals.groupId, memberships.groupId),
        eq(membershipRemovals.memberId, memberships.memberId),
        isNull(membershipRemovals.restoredAt),
      ),
    );
  return db
    .select({ group: groups, role: memberships.role, joinedAt: memberships.joinedAt })
    .from(memberships)
    .innerJoin(groups, eq(groups.id, memberships.groupId))
    .where(and(eq(memberships.memberId, memberId), notExists(stillOut)))
    .orderBy(asc(memberships.joinedAt), asc(groups.id));
}

/** Every membership a group has ever had, in the order the members joined it, then by member id. */
export async function groupRoster(db: Db, groupId: number): Promise<RosterEntry[]> {
  const [rows, removals] = await Promise.all([
    db
      .select({ member: members, role: memberships.role, joinedAt: memberships.joinedAt })
      .from(memberships)
      .innerJoin(members, eq(members.id, memberships.memberId))
      .where(eq(memberships.groupId, groupId))
      .orderBy(asc(memberships.joinedAt), asc(members.id)),
    db
      .select()
      .from(membershipRemovals)
      .where(eq(membershipRemovals.groupId, groupId))
      .orderBy(asc(membershipRemovals.removedAt)),
  ]);
  return rows.map((row) => ({
    ...row,
    removals: removals
      .filter((removal) => removal.memberId === row.member.id)
      .map(({ removedAt, restoredAt }) => ({ removedAt, restoredAt })),
  }));
}

/**
 * Puts a newly created member in Mabry Family, the oldest group. Until the
 * Manage screen and the console's Groups list choose a group for a new person,
 * the console and the seed only ever add family, and a member left out of
 * every group would vanish from the boards once they are group-scoped. Does
 * nothing on a database with no group.
 */
export async function joinFamily(
  db: Db,
  member: Pick<Member, "id" | "joinedAt">,
  role: MembershipRole,
): Promise<void> {
  const [family] = await db.select({ id: groups.id }).from(groups).orderBy(asc(groups.id)).limit(1);
  if (!family) return;
  await db.insert(memberships).values({ groupId: family.id, memberId: member.id, role, joinedAt: member.joinedAt });
}
