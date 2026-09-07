"use server";

import { redirect } from "next/navigation";
import { freshCfbd } from "@/lib/cfbd";
import type { ActionState } from "@/lib/console/state";
import {
  dropOverride,
  editResult,
  refreshResults,
  restoreResult,
  resultsWeekHref,
  voidResult,
} from "@/lib/results/console-edits";
import { consoleRoute } from "../context";

type ResultActionState = ActionState;

export async function chooseResultsWeekAction(formData: FormData) {
  redirect(await resultsWeekHref(consoleRoute(), formData));
}

/** Pulls the week's scores from CollegeFootballData now, through the cache, whatever the stale gate thinks. */
export function refreshResultsAction(_prev: ResultActionState, formData: FormData): Promise<ResultActionState> {
  return refreshResults(consoleRoute(), formData, freshCfbd());
}

export function overrideResultAction(_prev: ResultActionState, formData: FormData): Promise<ResultActionState> {
  return editResult(consoleRoute(), formData);
}

export function clearOverrideAction(_prev: ResultActionState, formData: FormData): Promise<ResultActionState> {
  return dropOverride(consoleRoute(), formData);
}

export function voidResultAction(_prev: ResultActionState, formData: FormData): Promise<ResultActionState> {
  return voidResult(consoleRoute(), formData);
}

export function restoreGameAction(_prev: ResultActionState, formData: FormData): Promise<ResultActionState> {
  return restoreResult(consoleRoute(), formData);
}
