"use server";

import { cfbd, freshCfbd } from "@/lib/cfbd";
import type { ActionState } from "@/lib/console/state";
import {
  addGame,
  chooseTiebreaker,
  dropGame,
  editDeadline,
  editPublish,
  editVoidGame,
  refreshSlate,
} from "@/lib/slate/console-edits";
import { openMeteo } from "@/lib/weather/open-meteo";
import { consoleRoute } from "../context";

export type SlateActionState = ActionState;

export async function addGameAction(formData: FormData) {
  await addGame(consoleRoute(), formData, cfbd(), openMeteo());
}

export async function removeGameAction(formData: FormData) {
  await dropGame(consoleRoute(), formData);
}

export async function setTiebreakerAction(formData: FormData) {
  await chooseTiebreaker(consoleRoute(), formData);
}

export async function setDeadlineAction(_prev: SlateActionState, formData: FormData): Promise<SlateActionState> {
  return editDeadline(consoleRoute(), formData);
}

export async function publishAction(_prev: SlateActionState, formData: FormData): Promise<SlateActionState> {
  return editPublish(consoleRoute(), formData);
}

export async function voidGameAction(_prev: SlateActionState, formData: FormData): Promise<SlateActionState> {
  return editVoidGame(consoleRoute(), formData);
}

export async function refreshAction(formData: FormData) {
  await refreshSlate(consoleRoute(), formData, freshCfbd(), openMeteo());
}
