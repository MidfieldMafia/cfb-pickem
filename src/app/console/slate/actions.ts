"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { cfbd } from "@/lib/cfbd";
import { weekCandidates } from "@/lib/cfbd/candidates";
import { requireConsole } from "@/lib/members/current";
import {
  addGame,
  InvalidSlate,
  openWeek,
  publishSlate,
  refreshFromFeed,
  removeGame,
  setDeadline,
  setTiebreaker,
  slateFor,
  voidGame,
} from "@/lib/slate/slate";

export interface SlateActionState {
  error?: string;
  done?: string;
}

const SLATE_PATH = "/console/slate";

function num(formData: FormData, name: string): number {
  const value = Number(formData.get(name));
  if (!Number.isFinite(value)) throw new InvalidSlate(`Missing ${name}.`);
  return value;
}

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
  const slate = await slateFor(db(), weekId);
  const candidates = await weekCandidates(cfbd(), { year: slate.season.year, week: slate.week.weekNumber });
  const candidate = candidates.find((c) => c.cfbdGameId === cfbdGameId);
  if (!candidate) throw new InvalidSlate("That game is no longer in the feed.");
  await addGame(db(), actor, weekId, candidate);
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
  const client = cfbd();
  client.invalidate();
  await refreshFromFeed(db(), client, num(formData, "weekId"));
  revalidatePath(SLATE_PATH);
}
