/**
 * The commissioner's pick edits as the console submits them: a `FormData` in,
 * an `ActionState` out, over an injected `ConsoleRoute`. The `"use server"`
 * file above this is three one-line adapters; everything a test would want to
 * check about a commissioner's edit — which rules ran, what got audited, which
 * screens were invalidated — happens here.
 */
import "server-only";
import { consoleEdit, type ConsoleRoute } from "@/lib/console/route";
import type { ActionState } from "@/lib/console/state";
import { asCommissioner } from "@/lib/members/authority";
import { integerField, optionalIntegerField, type Fields } from "@/lib/parse";
import { openWeek, slateFor } from "@/lib/slate/slate";
import { applyEdit } from "./edits";
import { InvalidPick } from "./picks";

export const PICKS_PATH = "/console/picks";

const id = (fields: Fields, name: string) => integerField(fields, name, (field) => new InvalidPick(`Missing ${field}.`));

/** An empty field clears the value; anything that is not a whole number is refused. */
const optional = (fields: Fields, name: string) =>
  optionalIntegerField(fields, name, (field) => new InvalidPick(`${field} must be a whole number.`));

/**
 * Every screen one member's pick edit shows up on: the console table, that
 * member's own console page, and the three member screens that read a sheet.
 */
function pickPaths(memberId: number): string[] {
  return [PICKS_PATH, `${PICKS_PATH}/${memberId}`, "/week", "/picks", "/picks/review"];
}

export function editPick(route: ConsoleRoute, form: FormData): Promise<ActionState> {
  return consoleEdit(route, async ({ db, actor, now }) => {
    const memberId = id(form, "memberId");
    const slate = await slateFor(db, id(form, "weekId"));
    await applyEdit(
      db,
      asCommissioner(actor, memberId),
      slate,
      { kind: "pick", gameId: id(form, "gameId"), teamId: id(form, "teamId") },
      now,
    );
    return { done: "Saved and logged.", revalidate: pickPaths(memberId) };
  });
}

export function editLock(route: ConsoleRoute, form: FormData): Promise<ActionState> {
  return consoleEdit(route, async ({ db, actor, now }) => {
    const memberId = id(form, "memberId");
    const slate = await slateFor(db, id(form, "weekId"));
    const gameId = optional(form, "gameId");
    await applyEdit(db, asCommissioner(actor, memberId), slate, { kind: "lock", gameId }, now);
    return {
      done: gameId === null ? "Lock cleared and logged." : "Lock saved and logged.",
      revalidate: pickPaths(memberId),
    };
  });
}

export function editGuess(route: ConsoleRoute, form: FormData): Promise<ActionState> {
  return consoleEdit(route, async ({ db, actor, now }) => {
    const memberId = id(form, "memberId");
    const slate = await slateFor(db, id(form, "weekId"));
    const guess = optional(form, "guess");
    await applyEdit(db, asCommissioner(actor, memberId), slate, { kind: "guess", guess }, now);
    return {
      done: guess === null ? "Tiebreaker Guess cleared and logged." : "Tiebreaker Guess saved and logged.",
      revalidate: pickPaths(memberId),
    };
  });
}

/** Where "go to week N" lands, so the action above is one `redirect` over this. */
export async function picksWeekHref(route: ConsoleRoute, form: FormData): Promise<string> {
  const actor = await route.requireConsole();
  const week = await openWeek(route.db, actor, id(form, "weekNumber"));
  return `${PICKS_PATH}?week=${week.weekNumber}`;
}
