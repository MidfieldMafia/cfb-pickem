/**
 * The request-scoped glue every console edit runs on, handed in rather than
 * imported — the same trick `PickRoute` plays for the pick entry API, and for
 * the same reason: the `"use server"` files reached straight for `db()`,
 * `cookies()` and `revalidatePath`, so nothing about a commissioner's edit
 * could be run by a test.
 *
 * It also puts the catch set in one place. Four action files each had their
 * own, and they had already drifted: one caught only `InvalidSlate`, and two
 * actions caught nothing at all, so a blank Void note threw past the screen
 * instead of showing the message the slate seam wrote for it.
 *
 * This file used to enumerate the four error classes it knew about, which was
 * that same drift one level up — a `CfbdError` matched none of them. It asks
 * `Refusal` now, and so imports no domain module at all.
 */
import "server-only";
import type { Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { Refusal } from "@/lib/refusal";
import type { ActionState, EditOutcome } from "./state";

export interface ConsoleRoute {
  db: Db;
  requireConsole: () => Promise<Member>;
  revalidate: (path: string) => void;
  /** The wall clock unless given; a test pins it to a moment inside the fixture's Week. */
  now?: () => Date;
}

/**
 * Runs one console edit: the commissioner check first, then the work, then the
 * cache invalidations the work asked for. A refusal comes back as a message,
 * so a form shows it under the button rather than throwing to the error page.
 *
 * Anything that is not a `Refusal` still throws: a missing table is not a
 * message for a commissioner to read, and neither is `NotCommissioner`, which
 * `requireConsole` has already answered with a 404 by the time we get here.
 */
export async function consoleEdit(
  route: ConsoleRoute,
  work: (ctx: { db: Db; actor: Member; now: Date }) => Promise<EditOutcome>,
): Promise<ActionState> {
  try {
    return await consoleAction(route, work).then(({ done }) => (done ? { done } : {}));
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    return { error: error.message };
  }
}

/**
 * The same edit without the catch, for a button whose refusals are faults
 * rather than messages: adding a game the slate already has, removing one
 * from a published Week. The screen disables those, so reaching them means
 * something is wrong and the error page is the honest answer — swallowing it
 * into a form that renders no message would hide it instead.
 */
export async function consoleAction(
  route: ConsoleRoute,
  work: (ctx: { db: Db; actor: Member; now: Date }) => Promise<EditOutcome>,
): Promise<EditOutcome> {
  const actor = await route.requireConsole();
  const outcome = await work({ db: route.db, actor, now: route.now?.() ?? new Date() });
  for (const path of outcome.revalidate) route.revalidate(path);
  return outcome;
}
