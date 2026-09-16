"use server";

import type { ActionState } from "@/lib/console/state";
import { createGroupEdit, deleteGroupEdit } from "@/lib/groups/console-edits";
import { consoleRoute } from "../context";

export async function createGroupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return createGroupEdit(consoleRoute(), formData);
}

export async function deleteGroupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return deleteGroupEdit(consoleRoute(), formData);
}
