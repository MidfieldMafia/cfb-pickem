/**
 * The Manage screen's edits as its forms submit them, over an injected route,
 * the way `console/route.ts` does it for the console: the `"use server"` file
 * stays a line per action, and everything a test can hold runs here.
 *
 * The group comes from the form, and that is safe only because it is checked
 * rather than trusted: `manageGroup` runs against the session's member on every
 * post, so a hand-edited `groupId` reaches a group the actor runs or nothing.
 */
import "server-only";
import type { Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { magicLinkFor } from "@/lib/members/members";
import { integerField, type Fields } from "@/lib/parse";
import { Refusal } from "@/lib/refusal";
import {
  addExistingToGroup,
  addToGroup,
  demoteInGroup,
  InvalidGroup,
  manageGroup,
  type Manager,
  promoteInGroup,
  regenerateInGroup,
  removeFromGroup,
  renameGroup,
  restoreToGroup,
} from "./manage";
import { managePath, type ManageState } from "./manage-state";

export interface ManageRoute {
  db: Db;
  requireMember: () => Promise<Member>;
  revalidate: (path: string) => void;
  /** The deployment's URL, for a Magic Link shown once. */
  appUrl: string;
  /** The session the actor is using, kept signed in when they regenerate their own link. */
  sessionId?: string;
  /** The wall clock unless given. */
  now?: () => Date;
}

/**
 * Where a group's membership and name show. Removing or restoring moves a
 * group's boards, renaming heads them, and a role change moves the header's
 * Manage icon, so every edit refreshes the lot rather than each guessing.
 */
const BOARDS = ["/leaderboard", "/live", "/history", "/history/results"];

const id = (fields: Fields, name: string) => integerField(fields, name, (field) => new InvalidGroup(`Missing ${field}.`));

interface Outcome {
  done: string;
  link?: string;
  /** The actor no longer runs this group, so the screen they are on is gone. */
  gone?: boolean;
}

async function manageEdit(
  route: ManageRoute,
  fields: FormData,
  work: (ctx: { db: Db; manager: Manager; now: Date }) => Promise<Outcome>,
): Promise<ManageState> {
  const actor = await route.requireMember();
  const groupId = id(fields, "groupId");
  // Outside the catch: not running the group is a fault, answered by the screen's 404.
  const manager = await manageGroup(route.db, actor, groupId);
  try {
    const outcome = await work({ db: route.db, manager, now: route.now?.() ?? new Date() });
    for (const path of [managePath(groupId), ...BOARDS]) route.revalidate(path);
    return outcome;
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    return { error: error.message };
  }
}

const text = (fields: FormData, name: string) => String(fields.get(name) ?? "");

export function addPerson(route: ManageRoute, fields: FormData): Promise<ManageState> {
  return manageEdit(route, fields, async ({ db, manager, now }) => {
    const added = await addToGroup(
      db,
      manager,
      { displayName: text(fields, "displayName"), phone: text(fields, "phone") },
      now,
    );
    return {
      done: `${added.displayName} is in. Send them this link; it won't be shown again.`,
      link: magicLinkFor(added, route.appUrl),
    };
  });
}

/** A commissioner's add of someone already in the app; `addExistingToGroup` refuses anyone else. */
export function addExistingPerson(route: ManageRoute, fields: FormData): Promise<ManageState> {
  return manageEdit(route, fields, async ({ db, manager, now }) => {
    const memberId = integerField(fields, "memberId", () => new InvalidGroup("Choose someone to add."));
    const added = await addExistingToGroup(db, manager, memberId, now);
    return { done: `${added.displayName} is in ${manager.group.name}.` };
  });
}

export function removePerson(route: ManageRoute, fields: FormData): Promise<ManageState> {
  return manageEdit(route, fields, async ({ db, manager, now }) => {
    const gone = await removeFromGroup(db, manager, id(fields, "memberId"), now);
    return { done: `${gone.displayName} is removed from ${manager.group.name}.` };
  });
}

export function restorePerson(route: ManageRoute, fields: FormData): Promise<ManageState> {
  return manageEdit(route, fields, async ({ db, manager, now }) => {
    const back = await restoreToGroup(db, manager, id(fields, "memberId"), now);
    return { done: `${back.displayName} is back in ${manager.group.name}.` };
  });
}

export function promotePerson(route: ManageRoute, fields: FormData): Promise<ManageState> {
  return manageEdit(route, fields, async ({ db, manager }) => {
    const promoted = await promoteInGroup(db, manager, id(fields, "memberId"));
    return { done: `${promoted.displayName} is now an organizer.` };
  });
}

export function demotePerson(route: ManageRoute, fields: FormData): Promise<ManageState> {
  return manageEdit(route, fields, async ({ db, manager }) => {
    const memberId = id(fields, "memberId");
    const demoted = await demoteInGroup(db, manager, memberId);
    const self = memberId === manager.actor.id;
    return {
      done: self ? "You are no longer an organizer." : `${demoted.displayName} is no longer an organizer.`,
      gone: self && !manager.commissioner,
    };
  });
}

export function regeneratePerson(route: ManageRoute, fields: FormData): Promise<ManageState> {
  return manageEdit(route, fields, async ({ db, manager }) => {
    const renewed = await regenerateInGroup(db, manager, id(fields, "memberId"), { keepSessionId: route.sessionId });
    return {
      done: `${renewed.displayName}'s old link has stopped working. Send them this one; it won't be shown again.`,
      link: magicLinkFor(renewed, route.appUrl),
    };
  });
}

export function renameThisGroup(route: ManageRoute, fields: FormData): Promise<ManageState> {
  return manageEdit(route, fields, async ({ db, manager }) => {
    const renamed = await renameGroup(db, manager, text(fields, "name"));
    return { done: `Renamed to ${renamed.name}.` };
  });
}
