"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireConsole } from "@/lib/members/current";
import { addMember, InvalidMember, regenerateMagicLink, setMemberActive } from "@/lib/members/members";

export interface AddMemberState {
  error?: string;
  added?: string;
}

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
  await regenerateMagicLink(db(), actor, Number(formData.get("memberId")));
  revalidatePath("/console/members");
}

export async function setActiveAction(formData: FormData) {
  const actor = await requireConsole();
  await setMemberActive(db(), actor, Number(formData.get("memberId")), formData.get("active") === "true");
  revalidatePath("/console/members");
}
