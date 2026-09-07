"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db } from "@/db";
import { SESSION_COOKIE } from "@/lib/members/cookie";
import { requireConsole } from "@/lib/members/current";
import { addMember, InvalidMember, regenerateMagicLink, setMemberActive } from "@/lib/members/members";
import { integerField } from "@/lib/parse";

export interface AddMemberState {
  error?: string;
  added?: string;
}

const memberId = (formData: FormData) =>
  integerField(formData, "memberId", (name) => new InvalidMember(`Missing ${name}.`));

export async function addMemberAction(_prev: AddMemberState, formData: FormData): Promise<AddMemberState> {
  const actor = await requireConsole();
  try {
    const member = await addMember(db(), actor, {
      displayName: String(formData.get("displayName") ?? ""),
      phone: String(formData.get("phone") ?? ""),
    });
    revalidatePath("/console/members");
    return { added: member.displayName };
  } catch (error) {
    if (error instanceof InvalidMember) return { error: error.message };
    throw error;
  }
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
