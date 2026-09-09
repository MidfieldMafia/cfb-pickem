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
import { InvalidMember, removeMember } from "./members";

export const MEMBERS_PATH = "/console/members";

const id = (fields: Fields, name: string) =>
  integerField(fields, name, (field) => new InvalidMember(`Missing ${field}.`));

/**
 * Every screen that lists members or counts their Picks. A deactivated
 * member with Picks was still on those boards, and now is not.
 */
const SHOWN: string[] = [MEMBERS_PATH, "/console/picks", "/week", "/live", "/results", "/leaderboard"];

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
