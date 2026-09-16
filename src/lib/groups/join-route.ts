/**
 * The Join Link, Start a group, and You screen forms as they post, over an
 * injected route, the way `manage-route.ts` is for the Manage screen: the
 * `"use server"` files stay a line per action and set the cookies, and what a
 * test can hold runs here.
 *
 * Who is acting comes from the session and never from the form. A signed-out
 * post sets someone up; a signed-in one acts as that member, whatever fields
 * came with it.
 */
import "server-only";
import type { Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { integerField } from "@/lib/parse";
import { Refusal } from "@/lib/refusal";
import { joinSignedIn, joinSignedOut, leaveGroup, startGroupSignedIn, startGroupSignedOut, type NewPerson } from "./join";
import { InvalidGroup } from "./manage";
import type { JoinState } from "./join-state";

export interface JoinRoute {
  db: Db;
  /** The signed-in member, or null: these forms take both. */
  currentMember: () => Promise<Member | null>;
  /** Sets the session cookie for someone just set up. */
  signIn: (sessionId: string) => Promise<void>;
  /** Makes `groupId` the group this device shows. */
  showGroup: (groupId: number) => Promise<void>;
  revalidate: (path: string) => void;
  /** The wall clock unless given. */
  now?: () => Date;
}

/** Where a form goes next, or what it says. */
export type Outcome = JoinState | { to: string };

const text = (fields: FormData, name: string) => String(fields.get(name) ?? "");

const person = (fields: FormData): NewPerson => ({
  displayName: text(fields, "displayName"),
  phone: text(fields, "phone"),
  avatarId: text(fields, "avatarId"),
});

/** Refusals become the sentence under the button; anything else is a fault. */
async function answer(work: () => Promise<Outcome>): Promise<Outcome> {
  try {
    return await work();
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    return { error: error.message };
  }
}

/**
 * The Join Link's form. Signed out, the new person reads How to play next and
 * then adds the app to their home screen; signed in, they land on the boards.
 */
export function joinFromForm(route: JoinRoute, fields: FormData): Promise<Outcome> {
  return answer(async () => {
    const now = route.now?.() ?? new Date();
    const token = text(fields, "token");
    const member = await route.currentMember();
    if (member) {
      const group = await joinSignedIn(route.db, member, token, now);
      await route.showGroup(group.id);
      return { to: "/" };
    }
    const arrival = await joinSignedOut(route.db, token, person(fields), now);
    await route.signIn(arrival.sessionId);
    await route.showGroup(arrival.group.id);
    return { to: "/rules?setup=1" };
  });
}

/**
 * Start a group. Signed out, How to play comes first and then the organizer
 * screen, which carries on to the install steps; signed in, the organizer
 * screen is all there is.
 */
export function startFromForm(route: JoinRoute, fields: FormData): Promise<Outcome> {
  return answer(async () => {
    const now = route.now?.() ?? new Date();
    const groupName = text(fields, "groupName");
    const member = await route.currentMember();
    if (member) {
      const group = await startGroupSignedIn(route.db, member, groupName, now);
      await route.showGroup(group.id);
      return { to: `/start/${group.id}` };
    }
    const arrival = await startGroupSignedOut(route.db, groupName, person(fields), now);
    await route.signIn(arrival.sessionId);
    await route.showGroup(arrival.group.id);
    return { to: `/rules?setup=1&group=${arrival.group.id}` };
  });
}

/** Everywhere a group's membership shows, as the Manage screen's edits refresh. */
const BOARDS = ["/you", "/leaderboard", "/live", "/history", "/history/results"];

/** Leaving from the You screen. Signed out, there is nobody to leave anything. */
export function leaveFromForm(route: JoinRoute, fields: FormData): Promise<Outcome> {
  return answer(async () => {
    const member = await route.currentMember();
    if (!member) throw new Error("Leaving a group needs a signed-in member.");
    const groupId = integerField(fields, "groupId", () => new InvalidGroup("Missing group."));
    const group = await leaveGroup(route.db, member, groupId, route.now?.() ?? new Date());
    for (const path of BOARDS) route.revalidate(path);
    return { done: `You left ${group.name}.` };
  });
}
