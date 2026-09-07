/**
 * The slate builder's seven edits over an injected `ConsoleRoute`. Only
 * `editVoidGame` was ever exercised, and that from another module's suite.
 *
 * The revalidate sets are the only thing these wrappers add over `slate.ts`,
 * so they are asserted on every edit. The other half of what is under test is
 * which wrapper each edit uses: the three on `consoleEdit` turn a refusal into
 * a sentence for the screen, and the four on `consoleAction` deliberately do
 * not — the console disables those buttons, so reaching one means something is
 * wrong and the error page is the honest answer.
 */
import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { games, weeks } from "@/db/schema";
import { NotCommissioner } from "@/lib/members/members";
import { form, routeFor } from "@/test/console";
import {
  FAMU_AT_MIAMI,
  OHIO_STATE_AT_TEXAS,
  OKLAHOMA_AT_MICHIGAN,
  publishWeek2,
  seedWeek2,
  TUESDAY,
  WEEK_2,
} from "@/test/week-2";
import { addGame, openWeek, setTiebreaker, slateFor } from "./slate";
import {
  addGame as addGameFromConsole,
  chooseTiebreaker,
  dropGame,
  editDeadline,
  editPublish,
  refreshSlate,
} from "./console-edits";

/** Every slate edit before publish shows on the slate console and nowhere else. */
const SLATE_ONLY = ["/console/slate"];

/**
 * A draft Week 2 with Miami and Michigan on it, which is what the builder is
 * actually used on: `publishWeek2` is past the point where adding and dropping
 * are allowed at all.
 */
async function draft() {
  const seeded = await seedWeek2();
  const { db, jonah, candidate } = seeded;
  const week = await openWeek(db, jonah, WEEK_2.week);
  const miami = await addGame(db, jonah, week.id, candidate(FAMU_AT_MIAMI));
  const michigan = await addGame(db, jonah, week.id, candidate(OKLAHOMA_AT_MICHIGAN));
  const { route, revalidated } = routeFor(db, jonah, TUESDAY);
  return {
    ...seeded,
    week,
    miami,
    michigan,
    route,
    revalidated,
    reloadWeek: async () => (await db.query.weeks.findFirst({ where: eq(weeks.id, week.id) }))!,
  };
}

describe("the Deadline", () => {
  test("moves earlier, and refuses a time past the first kickoff or a time at all", async () => {
    const { route, revalidated, week, reloadWeek } = await draft();
    const earlier = new Date("2026-09-10T23:00:00Z");

    expect(await editDeadline(route, form({ weekId: week.id, deadline: earlier.toISOString() }))).toEqual({
      done: "Deadline moved.",
    });
    expect(revalidated).toEqual(SLATE_ONLY);
    expect((await reloadWeek()).deadline).toEqual(earlier);

    revalidated.length = 0;
    // Miami kicks off Friday 00:00Z; Saturday is past it.
    expect(await editDeadline(route, form({ weekId: week.id, deadline: "2026-09-12T18:00:00Z" }))).toEqual({
      error: "The deadline can only move earlier, never later than the first kickoff.",
    });
    // `new Date("not a time")` is the parse, and it has to land as a message.
    expect(await editDeadline(route, form({ weekId: week.id, deadline: "not a time" }))).toEqual({
      error: "That is not a valid time.",
    });
    expect(await editDeadline(route, form({ deadline: earlier.toISOString() }))).toEqual({ error: "Missing weekId." });
    expect(revalidated).toEqual([]);
  });
});

describe("publishing", () => {
  test("needs a game and a Tiebreaker Game, then makes the slate visible", async () => {
    const { db, jonah, route, revalidated, week, michigan, reloadWeek } = await draft();

    expect(await editPublish(route, form({ weekId: week.id }))).toEqual({
      error: "Flag a Tiebreaker Game before publishing.",
    });
    expect(revalidated).toEqual([]);

    await setTiebreaker(db, jonah, week.id, michigan.id);
    expect(await editPublish(route, form({ weekId: week.id }))).toEqual({
      done: "Published. Members can see the slate now.",
    });
    expect(revalidated).toEqual(SLATE_ONLY);
    expect((await reloadWeek()).published).toBe(true);
  });

  test("an empty week is refused before the Tiebreaker Game is even asked about", async () => {
    const { db, jonah } = await seedWeek2();
    const week = await openWeek(db, jonah, WEEK_2.week);
    const { route } = routeFor(db, jonah, TUESDAY);

    expect(await editPublish(route, form({ weekId: week.id }))).toEqual({
      error: "Add at least one game before publishing.",
    });
  });

  /**
   * The Deadline is the earliest kickoff, so publishing after it has passed is
   * refused — and that turns on the route's clock rather than the wall clock.
   */
  test("a Deadline already past is refused, on the route's clock", async () => {
    const { db, jonah, week, michigan } = await draft();
    await setTiebreaker(db, jonah, week.id, michigan.id);
    const { route } = routeFor(db, jonah, new Date("2026-09-14T00:00:00Z"));

    expect(await editPublish(route, form({ weekId: week.id }))).toEqual({
      error: "The deadline has already passed; move it or pick later games.",
    });
  });
});

/**
 * The four edits on `consoleAction`. A refusal here is a fault, so it throws
 * past the form rather than coming back as a message — the distinction the
 * screen's disabled buttons rest on.
 */
describe("the edits whose refusals are faults", () => {
  test("adding a game asks the feed for it, and refuses one the feed does not have", async () => {
    const { db, cfbd, rain, route, revalidated, week } = await draft();

    const outcome = await addGameFromConsole(
      route,
      form({ weekId: week.id, cfbdGameId: OHIO_STATE_AT_TEXAS }),
      cfbd,
      rain,
    );

    expect(outcome).toEqual({ revalidate: SLATE_ONLY });
    expect(revalidated).toEqual(SLATE_ONLY);
    expect((await slateFor(db, week.id)).games.map((g) => g.cfbdGameId)).toContain(OHIO_STATE_AT_TEXAS);

    // Not a message: nothing on the screen offers this.
    await expect(
      addGameFromConsole(route, form({ weekId: week.id, cfbdGameId: 1 }), cfbd, rain),
    ).rejects.toThrow("That game is no longer in the feed.");
  });

  test("dropping a game clears it, and clears the Tiebreaker Game that pointed at it", async () => {
    const { db, jonah, route, revalidated, week, michigan, reloadWeek } = await draft();
    await setTiebreaker(db, jonah, week.id, michigan.id);

    expect(await dropGame(route, form({ gameId: michigan.id }))).toEqual({ revalidate: SLATE_ONLY });
    expect(revalidated).toEqual(SLATE_ONLY);
    expect(await db.query.games.findFirst({ where: eq(games.id, michigan.id) })).toBeUndefined();
    expect((await reloadWeek()).tiebreakerGameId).toBeNull();
  });

  test("a published week refuses a drop, and it throws rather than showing a sentence", async () => {
    const { db, jonah, michigan } = await publishWeek2();
    const { route, revalidated } = routeFor(db, jonah, TUESDAY);

    await expect(dropGame(route, form({ gameId: michigan.id }))).rejects.toThrow(
      "The slate is published. Void a game instead of removing it.",
    );
    expect(revalidated).toEqual([]);
  });

  test("the Tiebreaker Game is flagged, and a void game cannot hold it", async () => {
    const { db, route, revalidated, week, michigan, reloadWeek } = await draft();

    expect(await chooseTiebreaker(route, form({ weekId: week.id, gameId: michigan.id }))).toEqual({
      revalidate: SLATE_ONLY,
    });
    expect(revalidated).toEqual(SLATE_ONLY);
    expect((await reloadWeek()).tiebreakerGameId).toBe(michigan.id);

    await db.update(games).set({ void: true }).where(eq(games.id, michigan.id));
    await expect(chooseTiebreaker(route, form({ weekId: week.id, gameId: michigan.id }))).rejects.toThrow(
      "A void game cannot be the Tiebreaker Game.",
    );
  });

  /**
   * `refreshSlate` writes game rows with no actor of its own, so the
   * commissioner check on the route is the only thing guarding it. That is why
   * it goes through the route at all, and it is what this asserts.
   */
  test("refreshing re-reads the week, and the route's check is the only thing guarding it", async () => {
    const { db, cfbd, rain, route, revalidated, week, michigan } = await draft();

    // Move a kickoff away from the feed so the refresh has something to put back.
    const moved = new Date("2026-09-12T23:00:00Z");
    await db.update(games).set({ kickoff: moved }).where(eq(games.id, michigan.id));
    const kickoffOf = async () => (await slateFor(db, week.id)).games.find((g) => g.id === michigan.id)!.kickoff;

    expect(await refreshSlate(route, form({ weekId: week.id }), cfbd, rain)).toEqual({ revalidate: SLATE_ONLY });
    expect(revalidated).toEqual(SLATE_ONLY);
    expect(await kickoffOf()).not.toEqual(moved);

    // `refreshFromFeed` writes game rows with no actor of its own, so nothing
    // below the route would stop a non-commissioner. When the check refuses,
    // the work must not have run: the row stays where the test put it.
    await db.update(games).set({ kickoff: moved }).where(eq(games.id, michigan.id));
    const barred: typeof route = {
      ...route,
      requireConsole: async () => {
        throw new NotCommissioner();
      },
    };

    await expect(refreshSlate(barred, form({ weekId: week.id }), cfbd, rain)).rejects.toThrow(NotCommissioner);
    expect(await kickoffOf()).toEqual(moved);
  });
});
