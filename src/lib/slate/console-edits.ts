/**
 * The commissioner's slate edits as the console submits them, over an
 * injected `ConsoleRoute`. The `"use server"` file above this is one line per
 * edit; the rules, the messages, and the cache invalidations are here, where a
 * test can reach them.
 */
import "server-only";
import { consoleAction, consoleEdit, type ConsoleRoute } from "@/lib/console/route";
import type { ActionState, EditOutcome } from "@/lib/console/state";
import type { CfbdClient } from "@/lib/cfbd/types";
import { integerField, type Fields } from "@/lib/parse";
import type { RainChanceSource } from "@/lib/weather/open-meteo";
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
} from "./slate";

export const SLATE_PATH = "/console/slate";

const num = (fields: Fields, name: string) =>
  integerField(fields, name, (field) => new InvalidSlate(`Missing ${field}.`));

/** The slate console is the only screen a slate edit shows on until publish. */
const slateOnly: string[] = [SLATE_PATH];

export function editDeadline(route: ConsoleRoute, form: FormData): Promise<ActionState> {
  return consoleEdit(route, async ({ db, actor }) => {
    await setDeadline(db, actor, num(form, "weekId"), new Date(String(form.get("deadline") ?? "")));
    return { done: "Deadline moved.", revalidate: slateOnly };
  });
}

export function editPublish(route: ConsoleRoute, form: FormData): Promise<ActionState> {
  return consoleEdit(route, async ({ db, actor }) => {
    await publishSlate(db, actor, num(form, "weekId"));
    return { done: "Published. Members can see the slate now.", revalidate: slateOnly };
  });
}

/**
 * Voiding takes a note a commissioner types, so its refusals — blank, or
 * longer than the limit — are messages for the screen rather than faults.
 */
export function editVoidGame(route: ConsoleRoute, form: FormData): Promise<ActionState> {
  return consoleEdit(route, async ({ db, actor, now }) => {
    await voidGame(db, actor, num(form, "gameId"), String(form.get("note") ?? ""), now);
    return {
      done: "Voided. It scores zero for everyone, and any Lock on it is dropped until the game is restored.",
      revalidate: [SLATE_PATH, "/week"],
    };
  });
}

export function addGame(
  route: ConsoleRoute,
  form: FormData,
  client: CfbdClient,
  rain: RainChanceSource,
): Promise<EditOutcome> {
  return consoleAction(route, async ({ db, actor }) => {
    await addGameFromFeed(db, actor, client, num(form, "weekId"), num(form, "cfbdGameId"), rain);
    return { revalidate: slateOnly };
  });
}

export function dropGame(route: ConsoleRoute, form: FormData): Promise<EditOutcome> {
  return consoleAction(route, async ({ db, actor }) => {
    await removeGame(db, actor, num(form, "gameId"));
    return { revalidate: slateOnly };
  });
}

export function chooseTiebreaker(route: ConsoleRoute, form: FormData): Promise<EditOutcome> {
  return consoleAction(route, async ({ db, actor }) => {
    await setTiebreaker(db, actor, num(form, "weekId"), num(form, "gameId"));
    return { revalidate: slateOnly };
  });
}

/**
 * Re-reads the week from the feed. It writes game rows without an actor of its
 * own — see `refreshFromFeed` — so the commissioner check here is the only one
 * guarding it, which is why it runs through the route like every other edit.
 */
export function refreshSlate(
  route: ConsoleRoute,
  form: FormData,
  client: CfbdClient,
  rain: RainChanceSource,
): Promise<EditOutcome> {
  return consoleAction(route, async ({ db }) => {
    await refreshFromFeed(db, client, num(form, "weekId"), rain);
    return { revalidate: slateOnly };
  });
}

/** Where "go to week N" lands, so the action above is one `redirect` over this. */
export async function slateWeekHref(route: ConsoleRoute, form: FormData): Promise<string> {
  const actor = await route.requireConsole();
  const week = await openWeek(route.db, actor, num(form, "weekNumber"));
  return `${SLATE_PATH}?week=${week.weekNumber}`;
}
