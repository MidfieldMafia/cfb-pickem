"use server";

import { headers } from "next/headers";
import { db } from "@/db";
import type { FeedbackState } from "@/lib/feedback/limits";
import { sendFromForm } from "@/lib/feedback/route";
import { requireMember } from "@/lib/members/current";
import { pusher } from "@/lib/push/sender";

export async function sendFeedbackAction(_prev: FeedbackState, formData: FormData): Promise<FeedbackState> {
  return sendFromForm(
    { db: db(), requireMember, userAgent: async () => (await headers()).get("user-agent") ?? "", pusher: pusher() },
    formData,
  );
}
