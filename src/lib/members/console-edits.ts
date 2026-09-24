/**
 * The commissioner's member edits as the console submits them, over an
 * injected `ConsoleRoute`, so a refusal reads as a sentence under the button.
 * The two older member actions predate the route and still throw; the delete
 * cannot, because its refusals are the ones a commissioner most needs to read.
 */
import "server-only";
import { consoleEdit, type ConsoleRoute } from "@/lib/console/route";
import type { ActionState } from "@/lib/console/state";
import { integerField, type Fields } from "@/lib/parse";
import { plural } from "@/lib/plural";
import { managePath } from "@/lib/groups/manage-state";
import { memberGroups } from "@/lib/groups/memberships";
import { InvalidMember, removeMember, setPhone } from "./members";
import { clearPhoto } from "./photos";

export const MEMBERS_PATH = "/console/members";

const id = (fields: Fields, name: string) =>
  integerField(fields, name, (field) => new InvalidMember(`Missing ${field}.`));

/**
 * Every screen that lists members or counts their Picks. A deactivated
 * member with Picks was still on those boards, and now is not.
 */
const SHOWN: string[] = [
  MEMBERS_PATH,
  "/console/picks",
  "/live",
  "/leaderboard",
];

export function deleteMember(route: ConsoleRoute, form: FormData): Promise<ActionState> {
  return consoleEdit(route, async ({ db, actor }) => {
    const gone = await removeMember(db, actor, id(form, "memberId"));
    return { done: `${gone.displayName} is deleted.`, revalidate: SHOWN };
  });
}

/** The sentence beside the button: what a delete takes with it. */
export function deleteWarning(pickCount: number): string {
  return pickCount === 0
    ? "They have no Picks, so nothing else goes."
    : `Also deletes their ${plural(pickCount, "Pick")} and takes them off every board they were on.`;
}

/** Fills in, changes, or clears a phone number; it shows on each of their groups' Manage screens. */
export function editPhone(route: ConsoleRoute, form: FormData): Promise<ActionState> {
  return consoleEdit(route, async ({ db, actor }) => {
    const updated = await setPhone(db, actor, id(form, "memberId"), String(form.get("phone") ?? ""));
    const theirs = await memberGroups(db, updated.id);
    return {
      done: `${updated.displayName}'s phone number is ${updated.phone ? "saved" : "cleared"}.`,
      revalidate: [MEMBERS_PATH, ...theirs.map((g) => managePath(g.group.id))],
    };
  });
}

/**
 * Takes a member's photo down (#176's moderation floor): they show their
 * initial on every board until they pick a pennant again. Refreshes every
 * screen that draws Pennants, and each of their groups' Manage screens.
 */
export function clearMemberPhoto(route: ConsoleRoute, form: FormData): Promise<ActionState> {
  return consoleEdit(route, async ({ db, actor }) => {
    const cleared = await clearPhoto(db, actor, id(form, "memberId"));
    const theirs = await memberGroups(db, cleared.id);
    return {
      done: `${cleared.displayName}'s photo is cleared.`,
      revalidate: [...SHOWN, "/you", ...theirs.map((g) => managePath(g.group.id))],
    };
  });
}
