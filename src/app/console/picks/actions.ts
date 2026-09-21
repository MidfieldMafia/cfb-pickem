"use server";

import type { ActionState } from "@/lib/console/state";
import { appUrl } from "@/lib/app-url";
import { sendReminderTexts } from "@/lib/messaging/console-edits";
import { senderFromEnv } from "@/lib/messaging/sender";
import { editGuess, editLock, editPick } from "@/lib/picks/console-edits";
import { consoleRoute } from "../context";

export type { ActionState };

export async function overridePickAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return editPick(consoleRoute(), formData);
}

export async function overrideLockAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return editLock(consoleRoute(), formData);
}

export async function textRemindersAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return sendReminderTexts(consoleRoute(), senderFromEnv(), appUrl(), formData);
}

export async function overrideTiebreakerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return editGuess(consoleRoute(), formData);
}
