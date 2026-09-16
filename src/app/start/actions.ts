"use server";

import { redirect } from "next/navigation";
import { joinRoute } from "@/lib/groups/join-context";
import { startFromForm } from "@/lib/groups/join-route";
import type { JoinState } from "@/lib/groups/join-state";

export async function startAction(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const outcome = await startFromForm(await joinRoute(), formData);
  if ("to" in outcome) redirect(outcome.to);
  return outcome;
}
