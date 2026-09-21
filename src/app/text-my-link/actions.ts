"use server";

import { db } from "@/db";
import { appUrl } from "@/lib/app-url";
import type { ActionState } from "@/lib/console/state";
import { MAX_PHONE } from "@/lib/members/limits";
import { senderFromEnv } from "@/lib/messaging/sender";
import { textOwnLink } from "@/lib/messaging/texts";

/** "Text me my link": the answer is the same for every number that is not over budget. */
export async function textMyLinkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const phone = String(formData.get("phone") ?? "").trim();
  if (!phone || phone.length > MAX_PHONE) return { error: "Enter your phone number." };
  const answer = await textOwnLink(db(), senderFromEnv(), phone, appUrl());
  return answer === "budget_spent"
    ? { error: "We can’t send texts right now. Ask your organizer or a commissioner for your link." }
    : { done: "Check your texts." };
}
