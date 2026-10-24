"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireMember } from "@/lib/members/current";
import { InvalidSubscription, turnOffPush, turnOnPush } from "@/lib/push/settings";

/** Saves Push and this device, after the browser said Allow. */
export async function turnOnReminderAction(subscription: unknown): Promise<{ error?: string }> {
  const member = await requireMember();
  try {
    await turnOnPush(db(), member, subscription);
  } catch (error) {
    if (error instanceof InvalidSubscription) return { error: error.message };
    throw error;
  }
  revalidatePath("/settings");
  return {};
}

/** Turns the reminder off and deletes every device the member has. */
export async function turnOffReminderAction(): Promise<void> {
  await turnOffPush(db(), await requireMember());
  revalidatePath("/settings");
}
