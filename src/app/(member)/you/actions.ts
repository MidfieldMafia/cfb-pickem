"use server";

import { redirect } from "next/navigation";
import { joinRoute } from "@/lib/groups/join-context";
import { leaveFromForm } from "@/lib/groups/join-route";
import type { JoinState } from "@/lib/groups/join-state";
import { switchGroup } from "../actions";

export async function leaveAction(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const outcome = await leaveFromForm(await joinRoute(), formData);
  if ("to" in outcome) redirect(outcome.to);
  return outcome;
}

/** Switches to a group and opens its boards. `switchGroup` checks the group is theirs. */
export async function openGroupAction(formData: FormData): Promise<void> {
  await switchGroup(formData);
  redirect("/");
}
