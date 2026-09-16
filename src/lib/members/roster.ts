/**
 * Who is on a Week's board. There used to be three answers: the Reveal took
 * every active member, the console's who-hasn't-picked restated the rule in
 * SQL, and the scoring engine sat out anyone who joined after the Deadline. A
 * member who joined mid-week was on the board, off the console table, and out
 * of scoring — a name who picked nothing, on one screen only.
 *
 * Kept free of database imports, like `limits.ts`, so it is a rule rather than
 * a query: every caller reads its members and applies this, instead of each
 * spelling the filter into its own `where`.
 */

// Type-only, so this module stays a rule rather than a query: the import is
// erased at compile time and `memberships.ts`'s `server-only` never comes with
// it. One shape for a removal period, rather than a second spelling here.
import type { RemovalPeriod } from "@/lib/groups/memberships";

/** The least of a Member the rule needs. */
export interface RosterMember {
  id: number;
  active: boolean;
  /** The membership's joined-at for the group whose board this is, not the site-wide one. */
  joinedAt: Date;
  /**
   * Every period they were out of that group, in any order. Absent for a member
   * who has never been removed, which is nearly all of them.
   */
  removals?: readonly RemovalPeriod[];
}

/** Out of the group at that instant: removed before it, and not yet brought back by it. */
function awayAt(member: RosterMember, deadline: Date): boolean {
  const at = deadline.getTime();
  return (member.removals ?? []).some(
    ({ removedAt, restoredAt }) => at > removedAt.getTime() && (restoredAt === null || at <= restoredAt.getTime()),
  );
}

/** The least of a Week the rule needs: the Deadline that decides who was here in time. */
export interface RosterWeek {
  deadline: Date | null;
}

/**
 * The members a Week counts, in the order they were handed over.
 *
 * Two rules, and the second is the one that is easy to lose:
 *
 * 1. **Joined before the Deadline.** A member added mid-week never had a
 *    chance to pick, so the week is not theirs to have missed. `score-week.ts`
 *    states this rule a second time, as `playedWeek`, and deliberately: the
 *    scoring engine imports nothing outside `@/lib/scoring` and speaks in ISO
 *    strings and string ids, so sharing this function would either drag the
 *    engine onto the read path's types or loosen these ones into `Date | string`.
 *    Two statements of one rule is the price of that boundary; the engine's
 *    tests hold its copy, and this one holds the read path's. What is *not*
 *    acceptable is a third — which is what this function exists to have ended.
 * 2. **Active, or since deactivated with Picks on this Week.** Deactivating
 *    someone stops them signing in; it does not un-happen the points they
 *    already scored, so a board or a grading that dropped them would stop
 *    adding up. Callers that are *chasing* members rather than counting them —
 *    the reminder table — pass no picks and get the active members alone,
 *    because there is nothing to chase a deactivated member about.
 * 3. **In the group when the Deadline fell.** Removing someone hides them from
 *    every screen of that group, past weeks included, so a week that ran while
 *    they were out is not one they were ever on the board for. Unlike
 *    deactivation, Picks do not buy them back in: rule 2 is about a person who
 *    left the app, and this one about a person who left *this group* — their
 *    Picks still count everywhere else they play. Restoring them undoes it,
 *    because nothing was deleted.
 *
 * Rule 3 is the half `joinedAt` cannot state: a removal and a restore leave a
 * gap mid-season, and a single cutoff has no way to say the weeks either side
 * of it still count. `score-week.ts`'s `onBoard` states rules 1 and 3 a second
 * time for the engine, on the same two strict boundaries — see the note there.
 *
 * A Week with no Deadline is not published, so nobody is on its board yet.
 */
export function roster<M extends RosterMember>(
  members: readonly M[],
  week: RosterWeek,
  picked: ReadonlySet<number> = new Set(),
): M[] {
  const { deadline } = week;
  if (deadline === null) return [];
  return members.filter(
    (member) =>
      member.joinedAt.getTime() < deadline.getTime() &&
      (member.active || picked.has(member.id)) &&
      !awayAt(member, deadline),
  );
}
