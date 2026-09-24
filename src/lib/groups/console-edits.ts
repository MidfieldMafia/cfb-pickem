/**
 * The console's group edits as its forms submit them, over an injected
 * `ConsoleRoute`, so a refusal reads as a sentence under the button — the way
 * `members/console-edits.ts` does it for deleting a member.
 */
import "server-only";
import { consoleEdit, type ConsoleRoute } from "@/lib/console/route";
import type { ActionState } from "@/lib/console/state";
import { MEMBERS_PATH } from "@/lib/members/console-edits";
import { integerField } from "@/lib/parse";
import { plural } from "@/lib/plural";
import { addMember, createGroup, deleteGroup } from "./console";
import { InvalidGroup } from "./manage";
import { managePath } from "./manage-state";

export const GROUPS_PATH = "/console/groups";

/** Every board a group's membership shows on, as `manage-route.ts` refreshes them. */
const BOARDS = ["/leaderboard", "/live"];

const text = (fields: FormData, name: string) => String(fields.get(name) ?? "");

export function createGroupEdit(route: ConsoleRoute, form: FormData): Promise<ActionState> {
  return consoleEdit(route, async ({ db, actor }) => {
    const group = await createGroup(db, actor, text(form, "name"));
    return { done: `${group.name} is created. Open it to add people.`, revalidate: [GROUPS_PATH] };
  });
}

export function deleteGroupEdit(route: ConsoleRoute, form: FormData): Promise<ActionState> {
  return consoleEdit(route, async ({ db, actor }) => {
    const groupId = integerField(form, "groupId", (field) => new InvalidGroup(`Missing ${field}.`));
    const deleted = await deleteGroup(db, actor, groupId, text(form, "confirm"));
    return {
      done: `${deleted.name} is deleted. ${leftWithoutGroupWarning(deleted.leftWithoutGroup)}`,
      revalidate: [GROUPS_PATH, MEMBERS_PATH, managePath(groupId), ...BOARDS],
    };
  });
}

/** The Members page's add: someone new, into the group the commissioner chose. */
export function addPersonToGroup(route: ConsoleRoute, form: FormData): Promise<ActionState> {
  return consoleEdit(route, async ({ db, actor, now }) => {
    const groupId = integerField(form, "groupId", () => new InvalidGroup("Choose a group."));
    const added = await addMember(
      db,
      actor,
      groupId,
      { displayName: text(form, "displayName"), phone: text(form, "phone") },
      now,
    );
    const group = await db.query.groups.findFirst({ where: (g, { eq }) => eq(g.id, groupId) });
    return {
      done: `${added.displayName} is in ${group!.name}. Copy their link below and send it to them.`,
      revalidate: [MEMBERS_PATH, GROUPS_PATH, managePath(groupId), ...BOARDS],
    };
  });
}

/** The sentence beside a group's Delete button, and after it. */
export function leftWithoutGroupWarning(count: number): string {
  if (count === 0) return "Nobody is left without a group.";
  return `${count === 1 ? "1 person is" : `${count} people are`} left without a group; they keep their picks.`;
}
