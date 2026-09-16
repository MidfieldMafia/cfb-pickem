"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { currentGroup } from "@/lib/groups/current";
import { completeWelcome, InvalidWelcome } from "@/lib/members/auth";
import { requireMember } from "@/lib/members/current";
import { currentWeek, landingRoute } from "@/lib/week/week";

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
  // First time through, How to play comes next, then the install steps: this
  // is the browser session the Magic Link opened, and on iOS it is the only
  // one whose sign-in the home screen app will inherit. Afterwards this page
  // is just where a member edits their name, so send them back wherever the
  // Week's state lands them (#91).
  if (firstVisit) redirect("/rules?setup=1");
  const week = await currentWeek(db(), member, new Date(), { graded: true, group: await currentGroup() });
  redirect(landingRoute(week));
}
