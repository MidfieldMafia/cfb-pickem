"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db } from "@/db";
import { SESSION_COOKIE } from "@/lib/members/cookie";
import { requireConsole } from "@/lib/members/current";
import type { ActionState } from "@/lib/console/state";
import { appUrl } from "@/lib/app-url";
import { editOptOut, sendMagicLinkText } from "@/lib/messaging/console-edits";
import { senderFromEnv } from "@/lib/messaging/sender";
import { addPersonToGroup } from "@/lib/groups/console-edits";
import { clearMemberPhoto, deleteMember, editPhone } from "@/lib/members/console-edits";
import { InvalidMember, regenerateMagicLink, setMemberActive } from "@/lib/members/members";
import { integerField } from "@/lib/parse";
import { consoleRoute } from "../context";

const memberId = (formData: FormData) =>
  integerField(formData, "memberId", (name) => new InvalidMember(`Missing ${name}.`));

export async function addMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return addPersonToGroup(consoleRoute(), formData);
}

export async function regenerateAction(formData: FormData) {
  const actor = await requireConsole();
  const keepSessionId = (await cookies()).get(SESSION_COOKIE)?.value;
  await regenerateMagicLink(db(), actor, memberId(formData), { keepSessionId });
  revalidatePath("/console/members");
}

export async function setActiveAction(formData: FormData) {
  const actor = await requireConsole();
  await setMemberActive(db(), actor, memberId(formData), formData.get("active") === "true");
  revalidatePath("/console/members");
}

export async function deleteMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return deleteMember(consoleRoute(), formData);
}

export async function textMagicLinkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return sendMagicLinkText(consoleRoute(), senderFromEnv(), appUrl(), formData);
}

export async function optOutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return editOptOut(consoleRoute(), formData);
}

export async function editPhoneAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return editPhone(consoleRoute(), formData);
}

export async function clearPhotoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return clearMemberPhoto(consoleRoute(), formData);
}
