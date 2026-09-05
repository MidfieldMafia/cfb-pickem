"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { completeWelcome, InvalidWelcome } from "@/lib/members/auth";
import { requireMember } from "@/lib/members/current";

export interface WelcomeState {
  error?: string;
}

export async function saveWelcome(_prev: WelcomeState, formData: FormData): Promise<WelcomeState> {
  const member = await requireMember();
  try {
    await completeWelcome(db(), member, {
      displayName: String(formData.get("displayName") ?? ""),
      avatarId: String(formData.get("avatarId") ?? ""),
    });
  } catch (error) {
    if (error instanceof InvalidWelcome) return { error: error.message };
    throw error;
  }
  redirect("/week");
}
