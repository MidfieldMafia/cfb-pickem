"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireMember } from "@/lib/members/current";
import {
  InvalidSetting,
  InvalidSubscription,
  saveNotificationSetting,
  turnOffPush,
  turnOnPush,
  type NotificationKind,
} from "@/lib/push/settings";

/** Notifications on for this phone: saves its device, after the browser said Allow. */
export async function turnOnNotificationsAction(subscription: unknown): Promise<{ error?: string }> {
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

/** Notifications off for this phone: deletes this device only. */
export async function turnOffNotificationsAction(endpoint: string): Promise<void> {
  await turnOffPush(db(), await requireMember(), endpoint);
  revalidatePath("/settings");
}

/** One row on the card: saves one kind of push for the member, on every phone. */
export async function saveNotificationAction(kind: NotificationKind, value: unknown): Promise<{ error?: string }> {
  const member = await requireMember();
  try {
    await saveNotificationSetting(db(), member, kind, value);
  } catch (error) {
    if (error instanceof InvalidSetting) return { error: error.message };
    throw error;
  }
  revalidatePath("/settings");
  return {};
}
