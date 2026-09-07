/**
 * The catch set, on its own. Which errors a console edit turns into a sentence
 * used to be an enumeration of four classes in `route.ts`, and the two that
 * mattered were the ones it did not name: a `CfbdError` threw a commissioner
 * past the screen to the error page, and every new domain error would have
 * done the same until someone remembered to add it to the list.
 *
 * It asks `Refusal` now, so this suite pins the marker's contract rather than
 * a list — including the two errors that deliberately stay off it, which is
 * the half a passing enumeration could never have told us.
 *
 * No database and no fixture: the work a route runs is handed in, so a test of
 * the wrapper need not stand either up.
 */
import { describe, expect, test } from "vitest";
import type { Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { CfbdError } from "@/lib/cfbd/http";
import { InvalidWelcome } from "@/lib/members/auth";
import { InvalidMember, NotCommissioner } from "@/lib/members/members";
import { DeadlinePassed, InvalidPick, PicksHidden } from "@/lib/picks/picks";
import { InvalidResult } from "@/lib/results/results";
import { InvalidSlate, SlatePublished } from "@/lib/slate/slate";
import { consoleAction, consoleEdit, type ConsoleRoute } from "./route";

/** The actor is never read by the work these tests hand in. */
const ACTOR = {} as Member;

function routeFor(): { route: ConsoleRoute; revalidated: string[] } {
  const revalidated: string[] = [];
  return {
    route: {
      db: {} as Db,
      requireConsole: async () => ACTOR,
      revalidate: (path) => revalidated.push(path),
      now: () => new Date("2026-09-13T12:00:00Z"),
    },
    revalidated,
  };
}

/** One edit that does nothing but raise what it was handed. */
const raising = (error: unknown) => async (): Promise<never> => {
  throw error;
};

describe("what a console edit turns into a sentence", () => {
  test("every Refusal comes back as its message, and nothing is invalidated", async () => {
    for (const error of [
      new InvalidPick("Pick a team."),
      new InvalidMember("No such member."),
      new InvalidResult("That game is void; restore it before setting a score."),
      new InvalidSlate("The slate is published."),
      new InvalidWelcome("Pick one of the pennants."),
      // The class the old enumeration missed, and the reason for the marker.
      new CfbdError(503, "/games"),
    ]) {
      const { route, revalidated } = routeFor();
      expect(await consoleEdit(route, raising(error))).toEqual({ error: error.message });
      expect(revalidated).toEqual([]);
    }
  });

  test("a refusal two hops from the marker is still one", async () => {
    // `DeadlinePassed` extends `InvalidPick` and `SlatePublished` extends
    // `InvalidSlate`, so the marker has to survive the second hop.
    for (const error of [new DeadlinePassed(), new SlatePublished()]) {
      const { route } = routeFor();
      expect(await consoleEdit(route, raising(error))).toEqual({ error: error.message });
    }
  });

  test("a fault still throws, so the error page gets it", async () => {
    for (const error of [
      new Error('relation "weeks" does not exist'),
      new TypeError("cannot read properties of undefined"),
      // Not a Refusal on purpose: every console screen answers a
      // non-commissioner with `notFound()`, so this must never become a
      // sentence telling them what they are not allowed to do.
      new NotCommissioner(),
      // Not a Refusal on purpose: the pick API answers 403, and a console edit
      // reaching this is this code malfunctioning, not a person mistyping.
      new PicksHidden(),
    ]) {
      const { route } = routeFor();
      // The same error object, rethrown rather than wrapped.
      await expect(consoleEdit(route, raising(error))).rejects.toBe(error);
    }
  });

  test("a sentence and its invalidations come back together, in the order asked for", async () => {
    const { route, revalidated } = routeFor();

    expect(
      await consoleEdit(route, async () => ({ done: "Score set.", revalidate: ["/console/results", "/week"] })),
    ).toEqual({ done: "Score set." });
    expect(revalidated).toEqual(["/console/results", "/week"]);
  });

  test("an edit that says nothing answers an empty state rather than a stale one", async () => {
    const { route, revalidated } = routeFor();

    expect(await consoleEdit(route, async () => ({ revalidate: ["/week"] }))).toEqual({});
    expect(revalidated).toEqual(["/week"]);
  });

  test("consoleAction does not catch, so even a Refusal reaches the error page there", async () => {
    // The deliberate half of the split `route.ts` documents: the buttons whose
    // refusals are faults, because the screen disables them.
    const { route } = routeFor();
    const refused = new SlatePublished();

    await expect(consoleAction(route, raising(refused))).rejects.toBe(refused);
  });
});
