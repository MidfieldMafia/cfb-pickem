"use server";

import { redirect } from "next/navigation";
import {
  addPerson,
  demotePerson,
  promotePerson,
  regeneratePerson,
  removePerson,
  renameThisGroup,
  restorePerson,
} from "@/lib/groups/manage-route";
import type { ManageState } from "@/lib/groups/manage-state";
import { manageRoute } from "./context";

export async function addAction(_prev: ManageState, formData: FormData): Promise<ManageState> {
  return addPerson(await manageRoute(), formData);
}

export async function removeAction(_prev: ManageState, formData: FormData): Promise<ManageState> {
  return removePerson(await manageRoute(), formData);
}

export async function restoreAction(_prev: ManageState, formData: FormData): Promise<ManageState> {
  return restorePerson(await manageRoute(), formData);
}

export async function promoteAction(_prev: ManageState, formData: FormData): Promise<ManageState> {
  return promotePerson(await manageRoute(), formData);
}

/** Stepping down ends the organizer's access to this screen, so they land back on the board. */
export async function demoteAction(_prev: ManageState, formData: FormData): Promise<ManageState> {
  const state = await demotePerson(await manageRoute(), formData);
  if (state.gone) redirect("/leaderboard");
  return state;
}

export async function regenerateAction(_prev: ManageState, formData: FormData): Promise<ManageState> {
  return regeneratePerson(await manageRoute(), formData);
}

export async function renameAction(_prev: ManageState, formData: FormData): Promise<ManageState> {
  return renameThisGroup(await manageRoute(), formData);
}
