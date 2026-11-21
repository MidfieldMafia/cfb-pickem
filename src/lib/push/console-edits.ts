/**
 * The console's Send a push form over an injected `ConsoleRoute`, like the
 * other console edits, with the Pusher handed in so a test records the sends.
 */
import "server-only";
import { consoleEdit, type ConsoleRoute } from "@/lib/console/route";
import type { ActionState } from "@/lib/console/state";
import { customPushSummary, InvalidPush, sendCustomPush } from "./custom";
import type { Pusher } from "./sender";

export const PUSH_PATH = "/console/push";

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

/** `memberId` once per ticked box. */
function memberIds(form: FormData): number[] {
  return form.getAll("memberId").map((value) => {
    const id = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
    if (!Number.isSafeInteger(id)) throw new InvalidPush("Choose members from the list.");
    return id;
  });
}

/** Push is off on a server without the VAPID keys, so `pusher` is null there and the form says so. */
export function sendPushFromForm(route: ConsoleRoute, pusher: Pusher | null, form: FormData): Promise<ActionState> {
  return consoleEdit(route, async ({ db, now }) => {
    if (!pusher) throw new InvalidPush("Push isn't set up on this server: the WEB_PUSH_* keys are unset.");
    const result = await sendCustomPush(
      db,
      pusher,
      { title: text(form, "title"), body: text(form, "body"), url: text(form, "url"), sendId: text(form, "sendId"), memberIds: memberIds(form) },
      now,
    );
    // Reaching nobody is answered as a refusal, so the form keeps what was typed for another try.
    if (result.reached.length === 0 && result.repeated.length === 0) throw new InvalidPush(customPushSummary(result));
    return { done: customPushSummary(result), revalidate: [PUSH_PATH] };
  });
}
