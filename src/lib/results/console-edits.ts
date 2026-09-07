/**
 * The commissioner's result edits as the console submits them, over an
 * injected `ConsoleRoute`. The `"use server"` file above this is one line per
 * edit.
 */
import "server-only";
import type { CfbdClient } from "@/lib/cfbd/types";
import { consoleEdit, type ConsoleRoute } from "@/lib/console/route";
import type { ActionState } from "@/lib/console/state";
import { integerField, type Fields } from "@/lib/parse";
import { plural } from "@/lib/plural";
import { slateFor, voidGame } from "@/lib/slate/slate";
import { clearOverride, ingestResults, InvalidResult, overrideResult, restoreGame } from "./results";

export const RESULTS_PATH = "/console/results";

const num = (fields: Fields, name: string) =>
  integerField(fields, name, (field) => new InvalidResult(`Missing ${field}.`));

/** A result change moves the Reveal as well as the console table. */
const shown: string[] = [RESULTS_PATH, "/week"];

export function refreshResults(route: ConsoleRoute, form: FormData, client: CfbdClient): Promise<ActionState> {
  return consoleEdit(route, async ({ db }) => {
    const slate = await slateFor(db, num(form, "weekId"));
    const { changed } = await ingestResults(db, client, slate);
    return {
      done:
        changed === 0 ? "Checked the feed; nothing changed." : `Checked the feed; ${plural(changed, "game")} updated.`,
      revalidate: shown,
    };
  });
}

export function editResult(route: ConsoleRoute, form: FormData): Promise<ActionState> {
  return consoleEdit(route, async ({ db, actor, now }) => {
    await overrideResult(
      db,
      actor,
      num(form, "gameId"),
      {
        awayScore: num(form, "awayScore"),
        homeScore: num(form, "homeScore"),
        note: String(form.get("note") ?? ""),
      },
      now,
    );
    return { done: "Score set. It beats the feed until you clear it.", revalidate: shown };
  });
}

export function dropOverride(route: ConsoleRoute, form: FormData): Promise<ActionState> {
  return consoleEdit(route, async ({ db, actor, now }) => {
    await clearOverride(db, actor, num(form, "gameId"), now);
    return { done: "Override cleared; the feed's score counts again.", revalidate: shown };
  });
}

export function voidResult(route: ConsoleRoute, form: FormData): Promise<ActionState> {
  return consoleEdit(route, async ({ db, actor, now }) => {
    await voidGame(db, actor, num(form, "gameId"), String(form.get("note") ?? ""), now);
    return {
      done: "Voided. It scores zero for everyone, and any Lock on it is dropped until the game is restored.",
      revalidate: shown,
    };
  });
}

export function restoreResult(route: ConsoleRoute, form: FormData): Promise<ActionState> {
  return consoleEdit(route, async ({ db, actor, now }) => {
    await restoreGame(db, actor, num(form, "gameId"), now);
    return {
      done: "Restored. Dropped Locks count again, except where a member has since moved theirs.",
      revalidate: shown,
    };
  });
}

