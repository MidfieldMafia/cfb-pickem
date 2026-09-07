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

type ResultActionState = ActionState;

/** Pulls the week's scores from CollegeFootballData now, through the cache, whatever the stale gate thinks. */
export async function refreshResultsAction(_prev: ResultActionState, formData: FormData): Promise<ResultActionState> {
  return refreshResults(consoleRoute(), formData, freshCfbd());
}

export async function overrideResultAction(_prev: ResultActionState, formData: FormData): Promise<ResultActionState> {
  return editResult(consoleRoute(), formData);
}

export async function clearOverrideAction(_prev: ResultActionState, formData: FormData): Promise<ResultActionState> {
  return dropOverride(consoleRoute(), formData);
}

export async function voidResultAction(_prev: ResultActionState, formData: FormData): Promise<ResultActionState> {
  return voidResult(consoleRoute(), formData);
}

export async function restoreGameAction(_prev: ResultActionState, formData: FormData): Promise<ResultActionState> {
  return restoreResult(consoleRoute(), formData);
}
