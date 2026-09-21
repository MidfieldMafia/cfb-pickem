/**
 * The commissioner's texting buttons as the console submits them, over an
 * injected `ConsoleRoute` like the other console edits, plus the sender and the
 * app's address, which a test also wants to choose.
 */
import "server-only";
import { consoleEdit, type ConsoleRoute } from "@/lib/console/route";
import type { ActionState } from "@/lib/console/state";
import { InvalidMember, setSmsOptedOut } from "@/lib/members/members";
import { integerField } from "@/lib/parse";
import type { SmsSender } from "./sender";
import { remindEveryone, reminderSummary, textMagicLink } from "./texts";

const MEMBERS_PATH = "/console/members";
const PICKS_PATH = "/console/picks";

const id = (form: FormData, name: string) =>
  integerField(form, name, (field) => new InvalidMember(`Missing ${field}.`));

export function sendMagicLinkText(
  route: ConsoleRoute,
  sender: SmsSender,
  appUrl: string,
  form: FormData,
): Promise<ActionState> {
  return consoleEdit(route, async ({ db, actor, now }) => {
    const { member } = await textMagicLink(db, sender, actor, id(form, "memberId"), appUrl, now);
    return { done: `Texted ${member.displayName} their link.`, revalidate: [MEMBERS_PATH] };
  });
}

export function sendReminderTexts(
  route: ConsoleRoute,
  sender: SmsSender,
  appUrl: string,
  form: FormData,
): Promise<ActionState> {
  return consoleEdit(route, async ({ db, actor, now }) => {
    const result = await remindEveryone(db, sender, actor, id(form, "weekId"), appUrl, now);
    return { done: reminderSummary(result), revalidate: [PICKS_PATH, MEMBERS_PATH] };
  });
}

/** Records that a member replied STOP, or that they asked to be texted again. */
export function editOptOut(route: ConsoleRoute, form: FormData): Promise<ActionState> {
  return consoleEdit(route, async ({ db, actor }) => {
    const optedOut = form.get("optedOut") === "true";
    const member = await setSmsOptedOut(db, actor, id(form, "memberId"), optedOut);
    return {
      done: optedOut ? `${member.displayName} will get no texts.` : `${member.displayName} can be texted again.`,
      revalidate: [MEMBERS_PATH, PICKS_PATH],
    };
  });
}
