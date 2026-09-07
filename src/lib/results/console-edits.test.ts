/**
 * The results console's five edits over an injected `ConsoleRoute` — the seam
 * `route.ts` was built for and this module never cashed in. What these
 * wrappers add over `results.ts` is the form parse, the sentence, and the
 * revalidate set, so that is what is asserted here; the rules underneath are
 * `results.test.ts`'s job.
 *
 * The note handling is the bug class `route.ts` names outright: before the
 * route existed, two actions caught nothing at all, so a blank note threw past
 * the screen instead of showing the message the seam wrote for it.
 */
import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { games } from "@/db/schema";
import { CfbdError } from "@/lib/cfbd/http";
import type { CfbdClient } from "@/lib/cfbd/types";
import { form, routeFor } from "@/test/console";
import {
  FAMU_AT_MIAMI,
  feedWith,
  OKLAHOMA_AT_MICHIGAN,
  publishWeek2,
  SUNDAY,
  type PublishedWeek2,
} from "@/test/week-2";
import { dropOverride, editResult, refreshResults, restoreResult, voidResult } from "./console-edits";

/** Every result change shows on the console table and on the Reveal. */
const BOTH = ["/console/results", "/week"];

async function setup() {
  const fixture: PublishedWeek2 = await publishWeek2();
  const { route, revalidated } = routeFor(fixture.db, fixture.jonah, SUNDAY);
  return {
    ...fixture,
    route,
    revalidated,
    reload: async (gameId: number) => (await fixture.db.query.games.findFirst({ where: eq(games.id, gameId) }))!,
  };
}

describe("a commissioner's result edit from the console", () => {
  test("a score set answers the sentence, writes the override, and invalidates the table and the Reveal", async () => {
    const { route, revalidated, michigan, reload } = await setup();

    const state = await editResult(
      route,
      form({ gameId: michigan.id, awayScore: 24, homeScore: 27, note: "Feed had it wrong." }),
    );

    expect(state).toEqual({ done: "Score set. It beats the feed until you clear it." });
    expect(revalidated).toEqual(BOTH);
    // The message is not the evidence: the row has to carry it.
    expect(await reload(michigan.id)).toMatchObject({
      overrideAwayScore: 24,
      overrideHomeScore: 27,
      overrideNote: "Feed had it wrong.",
    });
  });

  test("a refusal comes back as a message, and nothing is invalidated", async () => {
    const { route, revalidated, michigan } = await setup();

    const state = await editResult(route, form({ gameId: michigan.id, awayScore: 24, homeScore: 999, note: "typo" }));

    expect(state.error).toBe("Scores are whole numbers, 0 to 250.");
    expect(state.done).toBeUndefined();
    expect(revalidated).toEqual([]);
  });

  /**
   * Every way a score can be wrong reads as the same sentence, because the
   * range is one parse now. `results.test.ts` asserted `-1` and `2.5` by
   * calling `overrideResult` directly, which walks past this parse: both cases
   * passed on the error *class* while the message a commissioner actually read
   * said "Missing awayScore." — `safeInteger` rejects a negative and a
   * fraction before a range check further in can word anything.
   */
  test("a negative, a fraction, and an absent score all read as the range", async () => {
    const { route, revalidated, michigan } = await setup();
    const set = (fields: Record<string, string | number>) =>
      editResult(route, form({ gameId: michigan.id, note: "typo", ...fields }));
    const RANGE = { error: "Scores are whole numbers, 0 to 250." };

    expect(await set({ awayScore: -1, homeScore: 27 })).toEqual(RANGE);
    expect(await set({ awayScore: 2.5, homeScore: 27 })).toEqual(RANGE);
    expect(await set({ awayScore: 24, homeScore: 251 })).toEqual(RANGE);
    expect(await set({ homeScore: 27 })).toEqual(RANGE);

    // The bounds themselves are good, and 0-0 is a real score.
    expect((await set({ awayScore: 0, homeScore: 0 })).done).toMatch(/beats the feed/);
    expect((await set({ awayScore: 250, homeScore: 27 })).done).toMatch(/beats the feed/);
    expect(revalidated).toEqual([...BOTH, ...BOTH]);
  });

  /**
   * The feed being down is not the commissioner's mistake, but the button is
   * theirs, so it answers a sentence. `route.ts` used to enumerate four error
   * classes and `CfbdError` was not one of them, so this threw past the screen
   * to the error page — the whole reason `Refusal` is a marker.
   */
  test("a feed outage is a sentence under the button, not the error page", async () => {
    const { route, revalidated, week } = await setup();
    const down = {
      scoreboard: async () => {
        throw new CfbdError(503, "/scoreboard");
      },
    } as unknown as CfbdClient;

    expect(await refreshResults(route, form({ weekId: week.id }), down)).toEqual({
      error: "CollegeFootballData returned 503 for /scoreboard.",
    });
    expect(revalidated).toEqual([]);
  });

  /**
   * `String(form.get("note") ?? "")` is the whole note parse, and an absent
   * field has to land on the same refusal a blank one does — the console's
   * Override row can post without it.
   */
  test("the Override note is required and capped, an absent field included", async () => {
    const { route, michigan } = await setup();
    const score = { gameId: michigan.id, awayScore: 24, homeScore: 27 };

    expect(await editResult(route, form(score))).toEqual({ error: "Say why in the note." });
    expect(await editResult(route, form({ ...score, note: "   " }))).toEqual({ error: "Say why in the note." });
    expect(await editResult(route, form({ ...score, note: "x".repeat(201) }))).toEqual({
      error: "Keep the note under 200 characters.",
    });

    // At the limit exactly, and it sets.
    expect((await editResult(route, form({ ...score, note: "x".repeat(200) }))).done).toMatch(/beats the feed/);
  });

  test("a missing id is a message rather than a crash, on each edit that takes one", async () => {
    const { route, revalidated } = await setup();

    expect(await editResult(route, form({ awayScore: 24, homeScore: 27, note: "why" }))).toEqual({
      error: "Missing gameId.",
    });
    expect(await dropOverride(route, form({}))).toEqual({ error: "Missing gameId." });
    expect(await voidResult(route, form({ note: "why" }))).toEqual({ error: "Missing gameId." });
    expect(await restoreResult(route, form({}))).toEqual({ error: "Missing gameId." });
    expect(await refreshResults(route, form({}), feedWith({}))).toEqual({ error: "Missing weekId." });
    expect(revalidated).toEqual([]);
  });

  test("an override has to exist before it can be cleared, and clearing it moves both screens", async () => {
    const { route, revalidated, michigan, reload } = await setup();

    expect(await dropOverride(route, form({ gameId: michigan.id }))).toEqual({ error: "That game has no override." });
    expect(revalidated).toEqual([]);

    await editResult(route, form({ gameId: michigan.id, awayScore: 24, homeScore: 27, note: "Feed had it wrong." }));
    revalidated.length = 0;

    expect(await dropOverride(route, form({ gameId: michigan.id }))).toEqual({
      done: "Override cleared; the feed's score counts again.",
    });
    expect(revalidated).toEqual(BOTH);
    expect(await reload(michigan.id)).toMatchObject({ overrideAwayScore: null, overrideNote: null });
  });

  /**
   * Voiding is reachable from the results console as well as the slate
   * builder, and this is the copy of it with its own revalidate set.
   */
  test("voiding takes a note, blocks a score, and restoring undoes it", async () => {
    const { route, revalidated, michigan, reload } = await setup();

    expect(await voidResult(route, form({ gameId: michigan.id, note: "  " }))).toEqual({
      error: "Say why in the note.",
    });

    const voided = await voidResult(route, form({ gameId: michigan.id, note: "Cancelled for weather." }));
    expect(voided.done).toMatch(/^Voided\./);
    expect(revalidated).toEqual(BOTH);
    expect(await reload(michigan.id)).toMatchObject({ void: true, voidNote: "Cancelled for weather." });

    // A void game takes no score until it is restored.
    expect(await editResult(route, form({ gameId: michigan.id, awayScore: 24, homeScore: 27, note: "why" }))).toEqual({
      error: "That game is void; restore it before setting a score.",
    });

    revalidated.length = 0;
    expect((await restoreResult(route, form({ gameId: michigan.id }))).done).toMatch(/^Restored\./);
    expect(revalidated).toEqual(BOTH);
    expect(await reload(michigan.id)).toMatchObject({ void: false, voidNote: null });

    // Twice is a refusal, not a second restore.
    expect(await restoreResult(route, form({ gameId: michigan.id }))).toEqual({ error: "That game is not void." });
  });

  test("the feed check says what changed, and counts one game as one", async () => {
    const { route, revalidated, week } = await setup();
    const check = (finals: Parameters<typeof feedWith>[0]) =>
      refreshResults(route, form({ weekId: week.id }), feedWith(finals));

    // The recording carries no scores, so the first pass moves nothing.
    expect(await check({})).toEqual({ done: "Checked the feed; nothing changed." });
    expect(revalidated).toEqual(BOTH);

    expect(await check({ [FAMU_AT_MIAMI]: [7, 45], [OKLAHOMA_AT_MICHIGAN]: [24, 27] })).toEqual({
      done: "Checked the feed; 2 games updated.",
    });
    // Only what moved counts: Miami and Michigan are already in.
    expect(await check({ [FAMU_AT_MIAMI]: [7, 45], [OKLAHOMA_AT_MICHIGAN]: [24, 28] })).toEqual({
      done: "Checked the feed; 1 game updated.",
    });
  });
});
