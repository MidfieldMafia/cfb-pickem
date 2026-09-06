"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { cfbdFromEnv } from "@/lib/cfbd/http";
import { requireConsole } from "@/lib/members/current";
import { plural } from "@/lib/plural";
import {
  clearOverride,
  ingestResults,
  InvalidResult,
  overrideResult,
  restoreGame,
} from "@/lib/results/results";
import { InvalidSlate, openWeek, voidGame } from "@/lib/slate/slate";

export interface ResultActionState {
  error?: string;
  done?: string;
}

const RESULTS_PATH = "/console/results";

function num(formData: FormData, name: string): number {
  const value = Number(formData.get(name));
  if (!Number.isFinite(value)) throw new InvalidResult(`Missing ${name}.`);
  return value;
}

/** Wraps a result edit so validation failures come back as a message, not a crash. */
async function attempt(work: () => Promise<string | undefined>): Promise<ResultActionState> {
  try {
    const done = await work();
    revalidatePath(RESULTS_PATH);
    revalidatePath("/week");
    return done ? { done } : {};
  } catch (error) {
    if (error instanceof InvalidResult || error instanceof InvalidSlate) return { error: error.message };
    throw error;
  }
}

export async function chooseResultsWeekAction(formData: FormData) {
  const actor = await requireConsole();
  const week = await openWeek(db(), actor, num(formData, "weekNumber"));
  redirect(`${RESULTS_PATH}?week=${week.weekNumber}`);
}

/** Pulls the week's scores from CollegeFootballData now, uncached, whatever the stale gate thinks. */
export async function refreshResultsAction(_prev: ResultActionState, formData: FormData): Promise<ResultActionState> {
  await requireConsole();
  return attempt(async () => {
    const { changed } = await ingestResults(db(), cfbdFromEnv(), num(formData, "weekId"));
    return changed === 0
      ? "Checked the feed; nothing changed."
      : `Checked the feed; ${plural(changed, "game")} updated.`;
  });
}

export async function overrideResultAction(_prev: ResultActionState, formData: FormData): Promise<ResultActionState> {
  const actor = await requireConsole();
  return attempt(async () => {
    await overrideResult(db(), actor, num(formData, "gameId"), {
      awayScore: num(formData, "awayScore"),
      homeScore: num(formData, "homeScore"),
      note: String(formData.get("note") ?? ""),
    });
    return "Score set. It beats the feed until you clear it.";
  });
}

export async function clearOverrideAction(_prev: ResultActionState, formData: FormData): Promise<ResultActionState> {
  const actor = await requireConsole();
  return attempt(async () => {
    await clearOverride(db(), actor, num(formData, "gameId"));
    return "Override cleared; the feed's score counts again.";
  });
}

export async function voidResultAction(_prev: ResultActionState, formData: FormData): Promise<ResultActionState> {
  const actor = await requireConsole();
  return attempt(async () => {
    await voidGame(db(), actor, num(formData, "gameId"), String(formData.get("note") ?? ""));
    return "Voided. It scores zero for everyone and any Lock on it is dropped.";
  });
}

export async function restoreGameAction(_prev: ResultActionState, formData: FormData): Promise<ResultActionState> {
  const actor = await requireConsole();
  return attempt(async () => {
    await restoreGame(db(), actor, num(formData, "gameId"));
    return "Restored. Locks the void dropped do not come back.";
  });
}
