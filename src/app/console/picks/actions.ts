"use server";

import type { ActionState } from "@/lib/console/state";
import { appUrl } from "@/lib/app-url";
import { sendReminders } from "@/lib/messaging/console-edits";
import { reminderSendersFromEnv } from "@/lib/messaging/reminder-senders";
import { editGuess, editLock, editPick } from "@/lib/picks/console-edits";
import { consoleRoute } from "../context";

export type { ActionState };

export async function overridePickAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return editPick(consoleRoute(), formData);
}

export async function overrideLockAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return editLock(consoleRoute(), formData);
}

/** Reminds everyone behind, each by their channel; while texting is paused, only members on Push are reached. */
export async function remindAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return sendReminders(consoleRoute(), reminderSendersFromEnv(), appUrl(), formData);
}

export async function overrideTiebreakerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return editGuess(consoleRoute(), formData);
}
