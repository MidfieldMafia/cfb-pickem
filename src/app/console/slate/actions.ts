"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { cfbd, freshCfbd } from "@/lib/cfbd";
import { requireConsole } from "@/lib/members/current";
import { integerField } from "@/lib/parse";
import { openMeteo } from "@/lib/weather/open-meteo";
import {
  addGameFromFeed,
  InvalidSlate,
  openWeek,
  publishSlate,
  refreshFromFeed,
  removeGame,
  setDeadline,
  setTiebreaker,
  voidGame,
} from "@/lib/slate/slate";

export interface SlateActionState {
  error?: string;
  done?: string;
}

const SLATE_PATH = "/console/slate";

const num = (formData: FormData, name: string) =>
  integerField(formData, name, (message) => new InvalidSlate(message));

/** Wraps a slate edit so validation failures come back as a message, not a crash. */
async function attempt(work: () => Promise<string | undefined>): Promise<SlateActionState> {
  try {
    const done = await work();
    revalidatePath(SLATE_PATH);
    return done ? { done } : {};
  } catch (error) {
    if (error instanceof InvalidSlate) return { error: error.message };
    throw error;
  }
}

export async function chooseWeekAction(formData: FormData) {
  const actor = await requireConsole();
  const week = await openWeek(db(), actor, num(formData, "weekNumber"));
  redirect(`${SLATE_PATH}?week=${week.weekNumber}`);
}

export async function addGameAction(formData: FormData) {
  const actor = await requireConsole();
  const weekId = num(formData, "weekId");
  const cfbdGameId = num(formData, "cfbdGameId");
  await addGameFromFeed(db(), actor, cfbd(), weekId, cfbdGameId, openMeteo());
  revalidatePath(SLATE_PATH);
}

export async function removeGameAction(formData: FormData) {
  const actor = await requireConsole();
  await removeGame(db(), actor, num(formData, "gameId"));
  revalidatePath(SLATE_PATH);
}

export async function setTiebreakerAction(formData: FormData) {
  const actor = await requireConsole();
  await setTiebreaker(db(), actor, num(formData, "weekId"), num(formData, "gameId"));
  revalidatePath(SLATE_PATH);
}

export async function setDeadlineAction(_prev: SlateActionState, formData: FormData): Promise<SlateActionState> {
  const actor = await requireConsole();
  return attempt(async () => {
    await setDeadline(db(), actor, num(formData, "weekId"), new Date(String(formData.get("deadline") ?? "")));
    return "Deadline moved.";
  });
}

export async function publishAction(_prev: SlateActionState, formData: FormData): Promise<SlateActionState> {
  const actor = await requireConsole();
  return attempt(async () => {
    await publishSlate(db(), actor, num(formData, "weekId"));
    return "Published. Members can see the slate now.";
  });
}

export async function voidGameAction(formData: FormData) {
  const actor = await requireConsole();
  await voidGame(db(), actor, num(formData, "gameId"), String(formData.get("note") ?? ""));
  revalidatePath(SLATE_PATH);
}

export async function refreshAction(formData: FormData) {
  await requireConsole();
  await refreshFromFeed(db(), freshCfbd(), num(formData, "weekId"), openMeteo());
  revalidatePath(SLATE_PATH);
}
