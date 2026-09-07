/**
 * Who is making a change, and on whose behalf. Pick entry has exactly two
 * callers — a member editing their own sheet from the phone, and a
 * commissioner editing anyone's from the console — and every rule that
 * differs between them turns on this one value: the Deadline binds a member
 * and not a commissioner, and a commissioner's edit is always audited.
 *
 * Minting is where the check lives. `asCommissioner` refuses a
 * non-commissioner, so a writer that takes an `Authority` cannot be reached
 * without one, and no writer needs a `requireCommissioner` of its own.
 */
import "server-only";
import type { Member } from "@/db/schema";
import { requireCommissioner } from "./members";

export type Authority =
  | { as: "member"; actor: Member }
  | { as: "commissioner"; actor: Member; memberId: number };

/** A member acting on their own sheet: the phone. */
export function asMember(actor: Member): Authority {
  return { as: "member", actor };
}

/**
 * A commissioner acting on `memberId`'s sheet: the console. Refuses anyone
 * who is not a commissioner in good standing, which is why the writers below
 * this can trust the value rather than re-check the actor.
 */
export function asCommissioner(actor: Member, memberId: number): Authority {
  requireCommissioner(actor);
  return { as: "commissioner", actor, memberId };
}

/** Whose sheet the edit lands on: a member edits their own, a commissioner anyone's. */
export function subjectOf(by: Authority): number {
  return by.as === "member" ? by.actor.id : by.memberId;
}
