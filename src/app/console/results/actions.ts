"use server";

import { freshCfbd } from "@/lib/cfbd";
import type { ActionState } from "@/lib/console/state";
import {
  dropOverride,
  editResult,
  refreshResults,
  restoreResult,
  voidResult,
} from "@/lib/results/console-edits";
import { consoleRoute } from "../context";

/** Pulls the week's scores from CollegeFootballData now, through the cache, whatever the stale gate thinks. */
export async function refreshResultsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return refreshResults(consoleRoute(), formData, freshCfbd());
}

export async function overrideResultAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return editResult(consoleRoute(), formData);
}

export async function clearOverrideAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return dropOverride(consoleRoute(), formData);
}

export async function voidResultAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return voidResult(consoleRoute(), formData);
}

export async function restoreGameAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return restoreResult(consoleRoute(), formData);
}
