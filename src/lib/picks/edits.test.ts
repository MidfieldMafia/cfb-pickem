/**
 * The one writer for a pick edit, from both sides: a member editing their own
 * sheet before the Deadline, and a commissioner editing anyone's at any time
 * with the change on the record. Over the published Week 2 fixture and a real
 * in-process database, because what separates the two callers is which rules
 * run and what rows get written.
 */
import { describe, expect, test } from "vitest";
import { asCommissioner, asMember } from "@/lib/members/authority";
import { NotCommissioner } from "@/lib/members/members";
import { editVoidGame } from "@/lib/slate/console-edits";
import { slateFor, voidGame } from "@/lib/slate/slate";
import { form, routeFor } from "@/test/console";
import { pickAs, publishWeek2, SUNDAY, THURSDAY } from "@/test/week-2";
import { pickAuditsFor } from "./console";
import { editGuess, editLock, editPick } from "./console-edits";
import { applyEdit, type PickEdit } from "./edits";
import { DeadlinePassed } from "./picks";

describe("a member's own edit", () => {
  test("a pick saves and comes back on the sheet; after the Deadline it is refused", async () => {
    const { db, grandma, slate, michigan } = await publishWeek2();

    const sheet = await applyEdit(
      db,
      asMember(grandma),
      slate,
      { kind: "pick", gameId: michigan.id, teamId: michigan.homeTeamId },
      THURSDAY,
    );

    expect(sheet.picks).toEqual([{ gameId: michigan.id, teamId: michigan.homeTeamId, updatedAt: THURSDAY }]);
    expect(sheet.locked).toBe(false);

    await expect(
      applyEdit(
        db,
        asMember(grandma),
        slate,
        { kind: "pick", gameId: michigan.id, teamId: michigan.awayTeamId },
        SUNDAY,
      ),
    ).rejects.toThrow(DeadlinePassed);
  });
});

describe("a commissioner's edit", () => {
  test("a pick lands after the Deadline and goes on the record", async () => {
    const { db, jonah, grandma, slate, week, michigan } = await publishWeek2();
    await applyEdit(
      db,
      asMember(grandma),
      slate,
      { kind: "pick", gameId: michigan.id, teamId: michigan.homeTeamId },
      THURSDAY,
    );

    const sheet = await applyEdit(
      db,
      asCommissioner(jonah, grandma.id),
      slate,
      { kind: "pick", gameId: michigan.id, teamId: michigan.awayTeamId },
      SUNDAY,
    );

    expect(sheet.picks).toEqual([{ gameId: michigan.id, teamId: michigan.awayTeamId, updatedAt: SUNDAY }]);
    const log = await pickAuditsFor(db, jonah, week.id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      memberId: grandma.id,
      memberName: "Grandma",
      gameId: michigan.id,
      kind: "pick",
      previousValue: "Michigan",
      newValue: "Oklahoma",
      changedBy: jonah.id,
      changedByName: "Jonah",
      changedAt: SUNDAY,
    });
  });

  test("a member cannot mint the Authority a commissioner edit needs", async () => {
    const { grandma } = await publishWeek2();

    expect(() => asCommissioner(grandma, grandma.id)).toThrow(NotCommissioner);
  });

  test("the Lock needs a pick under it, and moving and clearing it both name the team", async () => {
    const { db, jonah, grandma, slate, week, michigan, texas } = await publishWeek2();

    await expect(
      applyEdit(db, asMember(grandma), slate, { kind: "lock", gameId: michigan.id }, THURSDAY),
    ).rejects.toThrow(/pick a winner/i);

    for (const game of [michigan, texas]) {
      await applyEdit(
        db,
        asMember(grandma),
        slate,
        { kind: "pick", gameId: game.id, teamId: game.homeTeamId },
        THURSDAY,
      );
    }
    const set = await applyEdit(db, asMember(grandma), slate, { kind: "lock", gameId: michigan.id }, THURSDAY);
    expect(set.lockGameId).toBe(michigan.id);

    const moved = await applyEdit(db, asCommissioner(jonah, grandma.id), slate, { kind: "lock", gameId: texas.id }, SUNDAY);
    expect(moved.lockGameId).toBe(texas.id);
    const cleared = await applyEdit(db, asCommissioner(jonah, grandma.id), slate, { kind: "lock", gameId: null }, SUNDAY);
    expect(cleared.lockGameId).toBeNull();

    const log = await pickAuditsFor(db, jonah, week.id);
    expect(log.map((e) => [e.kind, e.previousValue, e.newValue])).toEqual([
      ["lock", "Michigan", "Texas"],
      ["lock", "Texas", null],
    ]);
  });

  test("a Guess saves, a bad one is refused, and clearing it is audited as a null", async () => {
    const { db, jonah, grandma, slate, week } = await publishWeek2();

    await expect(
      applyEdit(db, asMember(grandma), slate, { kind: "guess", guess: 300 }, THURSDAY),
    ).rejects.toThrow(/whole number/i);

    const saved = await applyEdit(db, asMember(grandma), slate, { kind: "guess", guess: 55 }, THURSDAY);
    expect(saved.tiebreakerGuess).toBe(55);

    const cleared = await applyEdit(db, asCommissioner(jonah, grandma.id), slate, { kind: "guess", guess: null }, SUNDAY);
    expect(cleared.tiebreakerGuess).toBeNull();

    const log = await pickAuditsFor(db, jonah, week.id);
    expect(log.map((e) => [e.kind, e.gameId, e.previousValue, e.newValue])).toEqual([
      ["tiebreaker_guess", null, "55", null],
    ]);
  });

  test("a member's own edit is not audited", async () => {
    const { db, jonah, grandma, slate, week, michigan } = await publishWeek2();

    await applyEdit(
      db,
      asMember(grandma),
      slate,
      { kind: "pick", gameId: michigan.id, teamId: michigan.homeTeamId },
      THURSDAY,
    );

    expect(await pickAuditsFor(db, jonah, week.id)).toEqual([]);
  });
});

/**
 * The two properties that used to be per-function assertions across two
 * modules. They are what makes this one writer worth having: the rules follow
 * from the `Authority`, not from which function the caller happened to reach
 * for.
 */
describe("what the Authority decides", () => {
  test("the Deadline binds a member on every kind of edit, and a commissioner on none", async () => {
    const { db, jonah, grandma, slate, michigan } = await publishWeek2();
    // A pick for the Lock to sit on, set while the Week was still open.
    await applyEdit(
      db,
      asMember(grandma),
      slate,
      { kind: "pick", gameId: michigan.id, teamId: michigan.homeTeamId },
      THURSDAY,
    );
    const edits: PickEdit[] = [
      { kind: "pick", gameId: michigan.id, teamId: michigan.awayTeamId },
      { kind: "lock", gameId: michigan.id },
      { kind: "guess", guess: 60 },
    ];

    for (const edit of edits) {
      await expect(applyEdit(db, asMember(grandma), slate, edit, SUNDAY)).rejects.toThrow(DeadlinePassed);
      await expect(applyEdit(db, asCommissioner(jonah, grandma.id), slate, edit, SUNDAY)).resolves.toBeTruthy();
    }
  });

  test("every commissioner edit writes exactly one audit row", async () => {
    const { db, jonah, grandma, slate, week, michigan } = await publishWeek2();
    const edits: PickEdit[] = [
      { kind: "pick", gameId: michigan.id, teamId: michigan.homeTeamId },
      { kind: "lock", gameId: michigan.id },
      { kind: "lock", gameId: null },
      { kind: "guess", guess: 60 },
      { kind: "guess", guess: null },
    ];

    for (const [index, edit] of edits.entries()) {
      await applyEdit(db, asCommissioner(jonah, grandma.id), slate, edit, SUNDAY);
      expect(await pickAuditsFor(db, jonah, week.id)).toHaveLength(index + 1);
    }

    // And each row says what it replaced, including the first, where there was nothing.
    const log = await pickAuditsFor(db, jonah, week.id);
    expect(log.map((e) => [e.kind, e.previousValue, e.newValue])).toEqual([
      ["pick", null, "Michigan"],
      ["lock", null, "Michigan"],
      ["lock", "Michigan", null],
      ["tiebreaker_guess", null, "60"],
      ["tiebreaker_guess", "60", null],
    ]);
  });

  test("a void game takes no pick and cannot hold the Lock, whoever is asking", async () => {
    const { db, jonah, grandma, slate, week, miami } = await publishWeek2();
    await applyEdit(
      db,
      asMember(grandma),
      slate,
      { kind: "pick", gameId: miami.id, teamId: miami.homeTeamId },
      THURSDAY,
    );
    await voidGame(db, jonah, miami.id, "Hurricane");
    // The Slate is the writer's source of truth for a Game, so a caller that
    // voided one re-reads it rather than editing against the rows it had.
    const fresh = await slateFor(db, week.id);

    for (const by of [asMember(grandma), asCommissioner(jonah, grandma.id)]) {
      await expect(
        applyEdit(db, by, fresh, { kind: "pick", gameId: miami.id, teamId: miami.awayTeamId }, THURSDAY),
      ).rejects.toThrow(/void/i);
      await expect(applyEdit(db, by, fresh, { kind: "lock", gameId: miami.id }, THURSDAY)).rejects.toThrow(/void/i);
    }
  });

  test("a Game that is not on this slate is refused without a database read", async () => {
    const { db, grandma, slate, michigan } = await publishWeek2();

    await expect(
      applyEdit(db, asMember(grandma), slate, { kind: "pick", gameId: 999999, teamId: michigan.homeTeamId }, THURSDAY),
    ).rejects.toThrow(/not on the slate/i);
  });
});

/**
 * The console edits over an injected `ConsoleRoute` — the seam the
 * `"use server"` files used to reach around. Nothing here could be run before:
 * the actions imported `db()`, `cookies()` and `revalidatePath` directly.
 */
describe("a commissioner's edit from the console", () => {
  test("a pick edit invalidates the console table, that member's page, and the three member screens", async () => {
    const { db, jonah, grandma, week, michigan } = await publishWeek2();
    const { route, revalidated } = routeFor(db, jonah, SUNDAY);

    const state = await editPick(
      route,
      form({ memberId: grandma.id, weekId: week.id, gameId: michigan.id, teamId: michigan.homeTeamId }),
    );

    expect(state).toEqual({ done: "Saved and logged." });
    expect(revalidated).toEqual([
      "/console/picks",
      `/console/picks/${grandma.id}`,
      "/week",
      "/picks",
      "/picks/review",
    ]);
  });

  /**
   * The Lock is the one console edit whose sentence has two branches, and the
   * same `optional()` parse that decides between them decides clear from
   * refuse — an empty field clears, a typo does not.
   */
  test("the Lock says whether it was saved or cleared, and a typo clears nothing", async () => {
    const { db, jonah, grandma, slate, week, michigan } = await publishWeek2();
    const { route, revalidated } = routeFor(db, jonah, SUNDAY);
    const lock = (gameId: string | number) => editLock(route, form({ memberId: grandma.id, weekId: week.id, gameId }));

    // A Lock needs a pick under it, and that refusal is a message.
    expect((await lock(michigan.id)).error).toMatch(/pick a winner/i);
    expect(revalidated).toEqual([]);

    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    expect(await lock(michigan.id)).toEqual({ done: "Lock saved and logged." });
    expect(revalidated).toEqual([
      "/console/picks",
      `/console/picks/${grandma.id}`,
      "/week",
      "/picks",
      "/picks/review",
    ]);

    // An empty field is the console's clear; a typo is a refusal, not a clear.
    expect(await lock("")).toEqual({ done: "Lock cleared and logged." });
    expect((await lock("michigan")).error).toMatch(/whole number/i);

    const log = await pickAuditsFor(db, jonah, week.id);
    expect(log.map((e) => [e.kind, e.previousValue, e.newValue])).toEqual([
      ["lock", null, "Michigan"],
      ["lock", "Michigan", null],
    ]);
  });

  test("a refusal comes back as a message, and nothing is invalidated", async () => {
    const { db, jonah, grandma, week } = await publishWeek2();
    const { route, revalidated } = routeFor(db, jonah, SUNDAY);

    const state = await editGuess(route, form({ memberId: grandma.id, weekId: week.id, guess: 300 }));

    expect(state.error).toMatch(/whole number/i);
    expect(state.done).toBeUndefined();
    expect(revalidated).toEqual([]);
  });

  test("an empty Guess field clears it rather than reaching the database as NaN", async () => {
    const { db, jonah, grandma, week } = await publishWeek2();
    const { route } = routeFor(db, jonah, SUNDAY);

    expect(await editGuess(route, form({ memberId: grandma.id, weekId: week.id, guess: "" }))).toEqual({
      done: "Tiebreaker Guess cleared and logged.",
    });
    // A typo is a refusal, not a clear: the old parser turned this into NaN and
    // only the Lock form checked for it.
    expect((await editGuess(route, form({ memberId: grandma.id, weekId: week.id, guess: "fifty" }))).error).toMatch(
      /whole number/i,
    );
  });

  test("a Void note must be given and must fit, and the message reaches the screen either way", async () => {
    const { db, jonah, miami } = await publishWeek2();
    const { route } = routeFor(db, jonah, SUNDAY);

    expect(await editVoidGame(route, form({ gameId: miami.id, note: "   " }))).toEqual({
      error: "Say why in the note.",
    });
    expect(await editVoidGame(route, form({ gameId: miami.id, note: "x".repeat(201) }))).toEqual({
      error: "Keep the note under 200 characters.",
    });

    // At the limit exactly, and it voids.
    const done = await editVoidGame(route, form({ gameId: miami.id, note: "x".repeat(200) }));
    expect(done.done).toMatch(/voided/i);
  });
});
