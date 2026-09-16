/**
 * Who a Week counts, and who it expected Picks from.
 *
 * There used to be three answers to the first question: the Reveal took every
 * active member, the console's who-hasn't-picked restated the rule in SQL, and
 * the scoring engine sat out anyone who joined after the Deadline. A member who
 * joined mid-week was on the board, off the console table, and out of scoring —
 * a name who picked nothing, on one screen only.
 *
 * Kept free of database imports, like `limits.ts`, so these are rules rather
 * than queries: every caller reads its members and applies one, instead of each
 * spelling the filter into its own `where`.
 */

/** The least of a Member the rules need. */
export interface RosterMember {
  id: number;
  active: boolean;
  joinedAt: Date;
}

/** The least of a Week the rules need: the Deadline that decides who was here in time. */
export interface RosterWeek {
  deadline: Date | null;
}

/**
 * The members a Week counts — its Played Week — in the order they were handed
 * over.
 *
 * Two rules, and both are easy to lose:
 *
 * 1. **Joined before the Deadline.** A member added mid-week never had a
 *    chance to pick, so the week is not theirs to have missed.
 * 2. **Made at least one Pick.** A week a member sat out touches nothing — no
 *    points, no average, no tiebreak — and the only way to mean that is to
 *    leave them off the board entirely rather than score them a zero that every
 *    average would then divide by. A Tiebreaker Guess alone is not enough: it
 *    is one field, sent without reading the slate. A Lock cannot stand alone
 *    either, since the writer refuses one with no Pick beneath it.
 *
 * `active` is deliberately *not* a third rule. It used to be one, widened to
 * "active, or since deactivated with Picks on this Week", because deactivating
 * someone does not un-happen the points they already scored. Requiring a Pick
 * of everybody subsumes that widening exactly: a member holding a Pick is
 * counted whether or not they can still sign in, and one holding none is not.
 * Chasing members is the other question, and `expected` answers it.
 *
 * `score-week.ts` states this same rule a second time, as `playedWeek`, and
 * deliberately: the scoring engine imports nothing outside `@/lib/scoring` and
 * speaks in ISO strings and string ids, so sharing this function would either
 * drag the engine onto the read path's types or loosen these ones into
 * `Date | string`. Two statements of one rule is the price of that boundary;
 * the engine's tests hold its copy, and this one holds the read path's. What is
 * *not* acceptable is a third — which is what this function exists to have
 * ended.
 *
 * A Week with no Deadline is not published, so nobody is on its board yet.
 */
export function roster<M extends RosterMember>(
  members: readonly M[],
  week: RosterWeek,
  picked: ReadonlySet<number>,
): M[] {
  const { deadline } = week;
  if (deadline === null) return [];
  return members.filter((member) => member.joinedAt.getTime() < deadline.getTime() && picked.has(member.id));
}

/**
 * The members a Week expected Picks from, in the order they were handed over:
 * who the reminder chases.
 *
 * The same Deadline rule, with `active` where `roster` wants a Pick. A member
 * who has not picked is precisely who this is for, and a deactivated member is
 * nobody to remind. So this is not `roster` under another argument: the two
 * disagree about every member holding no Pick, which is the entire population
 * a reminder is about.
 */
export function expected<M extends RosterMember>(members: readonly M[], week: RosterWeek): M[] {
  const { deadline } = week;
  if (deadline === null) return [];
  return members.filter((member) => member.joinedAt.getTime() < deadline.getTime() && member.active);
}
