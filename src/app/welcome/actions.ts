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
  const firstVisit = member.welcomedAt === null;
  try {
    await completeWelcome(db(), member, {
      displayName: String(formData.get("displayName") ?? ""),
      avatarId: String(formData.get("avatarId") ?? ""),
    });
  } catch (error) {
    if (error instanceof InvalidWelcome) return { error: error.message };
    throw error;
  }
  // First time through, the install steps come next: this is the browser
  // session the Magic Link opened, and on iOS it is the only one whose
  // sign-in the home screen app will inherit. Afterwards this page is just
  // where a member edits their name, so send them back to the week.
  redirect(firstVisit ? "/install" : "/week");
}
