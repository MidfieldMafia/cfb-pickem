"use server";

import { redirect } from "next/navigation";
import { joinRoute } from "@/lib/groups/join-context";
import { joinFromForm } from "@/lib/groups/join-route";
import type { JoinState } from "@/lib/groups/join-state";

export async function joinAction(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const outcome = await joinFromForm(await joinRoute(), formData);
  if ("to" in outcome) redirect(outcome.to);
  return outcome;
}
