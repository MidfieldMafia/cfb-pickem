"use server";

import type { ActionState } from "@/lib/console/state";
import { sendPushFromForm } from "@/lib/push/console-edits";
import { pusherFromEnv } from "@/lib/push/sender";
import { consoleRoute } from "../context";

/** Sends the commissioner's own push to the members they ticked. */
export async function sendPushAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return sendPushFromForm(consoleRoute(), pusherFromEnv(), formData);
}
