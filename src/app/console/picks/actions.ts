"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { requireConsole } from "@/lib/members/current";
import { InvalidMember } from "@/lib/members/members";
import { overrideLock, overridePick, overrideTiebreakerGuess } from "@/lib/picks/console";
import { InvalidPick } from "@/lib/picks/picks";
import { integerField } from "@/lib/parse";
import { InvalidSlate, openWeek } from "@/lib/slate/slate";
import type { ActionState } from "../action-form";

export type { ActionState };

const PICKS_PATH = "/console/picks";

const id = (formData: FormData, name: string) =>
  integerField(formData, name, (message) => new InvalidPick(message));

/** An optional whole number: an empty field clears the value. */
function optional(formData: FormData, name: string): number | null {
  const raw = String(formData.get(name) ?? "").trim();
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : Number.NaN;
}

/** Wraps a pick edit so a refusal comes back as a message, not a crash. */
async function attempt(memberId: number, work: () => Promise<string>): Promise<ActionState> {
  try {
    const done = await work();
    revalidatePath(PICKS_PATH);
    revalidatePath(`${PICKS_PATH}/${memberId}`);
    revalidatePath("/week");
    revalidatePath("/picks");
    revalidatePath("/picks/review");
    return { done };
  } catch (error) {
    if (error instanceof InvalidPick || error instanceof InvalidMember || error instanceof InvalidSlate) {
      return { error: error.message };
    }
    throw error;
  }
}

export async function choosePicksWeekAction(formData: FormData) {
  const actor = await requireConsole();
  const week = await openWeek(db(), actor, id(formData, "weekNumber"));
  redirect(`${PICKS_PATH}?week=${week.weekNumber}`);
}

export async function overridePickAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireConsole();
  const memberId = id(formData, "memberId");
  return attempt(memberId, async () => {
    await overridePick(db(), actor, memberId, id(formData, "weekId"), id(formData, "gameId"), id(formData, "teamId"));
    return "Saved and logged.";
  });
}

export async function overrideLockAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireConsole();
  const memberId = id(formData, "memberId");
  return attempt(memberId, async () => {
    const gameId = optional(formData, "gameId");
    if (Number.isNaN(gameId)) throw new InvalidPick("Choose a game for the Lock.");
    await overrideLock(db(), actor, memberId, id(formData, "weekId"), gameId);
    return gameId === null ? "Lock cleared and logged." : "Lock saved and logged.";
  });
}

export async function overrideTiebreakerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireConsole();
  const memberId = id(formData, "memberId");
  return attempt(memberId, async () => {
    const guess = optional(formData, "guess");
    await overrideTiebreakerGuess(db(), actor, memberId, id(formData, "weekId"), guess);
    return guess === null ? "Tiebreaker Guess cleared and logged." : "Tiebreaker Guess saved and logged.";
  });
}
