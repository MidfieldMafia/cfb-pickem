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
  publishSlate,
  refreshFromFeed,
  removeGame,
  setDeadline,
  setTiebreaker,
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
  return consoleEdit(route, async ({ db, actor, now }) => {
    // The route's clock, not the wall clock: publishing refuses a Deadline
    // that has already passed, so this is the one rule here a test can only
    // reach by pinning the moment.
    await publishSlate(db, actor, num(form, "weekId"), now);
    return { done: "Published. Members can see the slate now.", revalidate: slateOnly };
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
 * Re-reads the week from the feed. `refreshFromFeed` takes a `Commissioner`
 * it never logs — the write carries no actor to audit — so the route's
 * `requireConsole` is the only check, and the brand is what makes that
 * enforceable rather than a result the action used to discard.
 *
 * On `consoleEdit`, not `consoleAction`: a feed outage is nobody's mistake,
 * screen or commissioner, so it answers a sentence rather than the error page.
 */
export function refreshSlate(
  route: ConsoleRoute,
  form: FormData,
  client: CfbdClient,
  rain: RainChanceSource,
): Promise<ActionState> {
  return consoleEdit(route, async ({ db, actor }) => {
    await refreshFromFeed(db, actor, client, num(form, "weekId"), rain);
    return { revalidate: slateOnly };
  });
}

