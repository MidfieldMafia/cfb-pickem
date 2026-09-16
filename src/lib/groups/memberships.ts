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
 * A group's member as every board reads them: the person's row, with the
 * *membership's* joined-at and removals lifted onto the fields the two rules
 * look for. It satisfies `members/roster.ts`'s `RosterMember` and
 * `results/engine.ts`'s `GroupMember` at once, which is the point — the roster
 * is read once and the same rows reach the read path's rule and the engine's,
 * so the two cannot be handed different dates for the same person.
 *
 * `joinedAt` deliberately shadows `member.joinedAt`, the site-wide one. Nothing
 * downstream should ever reach past this to the row's own date: that is the
 * date that would give a member points in a group they had just joined.
 */
export interface BoardMember {
  id: number;
  active: boolean;
  /** The membership's joined-at, not `member.joinedAt`. */
  joinedAt: Date;
  removals: RemovalPeriod[];
  /** The person, for the name and pennant a board renders. */
  member: Member;
}

function toBoardMember(entry: RosterEntry): BoardMember {
  return {
    id: entry.member.id,
    active: entry.member.active,
    joinedAt: entry.joinedAt,
    removals: entry.removals,
    member: entry.member,
  };
}

/** Out of the group right now: a removal nobody has undone. */
function stillOut(entry: RosterEntry): boolean {
  return entry.removals.some((period) => period.restoredAt === null);
}

/**
 * The group's roster in the shape the boards read. One round trip, handed down
 * to the picks reader and the engine adapter alike rather than each asking.
 *
 * A member who is out right now is dropped here, and that is a *different* rule
 * from the one `roster` applies per Week. Removing someone hides them from
 * every screen of the group, past weeks included — a Weekly Win they hold can
 * move to somebody else — so it is not enough to excuse the weeks that ran
 * while they were away: the weeks *before* the removal have to go too, and only
 * dropping them from the board itself does that.
 *
 * Restoring puts them back here, whole, because nothing was deleted. From that
 * point `roster`'s per-Week rule takes over and excuses exactly the Weeks whose
 * Deadline fell inside a gap. The two rules meet here and nowhere else:
 * `groupRoster` deliberately keeps every membership the group has ever had,
 * because it is the data and this is the board.
 */
export async function groupBoard(db: Db, groupId: number): Promise<BoardMember[]> {
  const entries = await groupRoster(db, groupId);
  return entries.filter((entry) => !stillOut(entry)).map(toBoardMember);
}

/**
 * Puts a newly created commissioner in Mabry Family, the oldest group. Only the
 * seed's `bootstrapCommissioner` calls it: every other way of adding a person
 * chooses a group (`addToGroup`, and the console's `addMember`). Does nothing on
 * a database with no group.
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
