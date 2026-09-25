import { describe, expect, test } from "vitest";
import type { Member } from "@/db/schema";
import { setMemberActive } from "@/lib/members/members";
import { openWeek, slateFor } from "@/lib/slate/slate";
import { groupBoard } from "@/lib/groups/memberships";
import { familyGroup, guessAs, joinAt, lockAs, pickAs, publishWeek2, THURSDAY, TUESDAY } from "@/test/week-2";
import { DeadlinePassed, pickSheet, PicksHidden, seasonEntries, weekEntries } from "./picks";
import { restoreGame, voidGame } from "@/lib/results/writes";

/**
 * The shared published Week 2, plus readers that re-read the Slate each time:
 * `pickSheet` and `weekEntries` take the Week as loaded rows now, and a void or
 * a restore in the middle of a test moves them.
 */
async function setup() {
  const fixture = await publishWeek2();
  const { db, week } = fixture;
  // Every member the fixture seeds is in Mabry Family, so the family's board is
  // the same set of people this suite read before boards were group-scoped.
  const family = await familyGroup(db);
  return {
    ...fixture,
    family,
    fresh: () => slateFor(db, week.id),
    sheet: async (actor: Member, at: Date) => pickSheet(db, actor, await slateFor(db, week.id), at),
    board: () => groupBoard(db, family.id),
    everyone: () => db.query.members.findMany(),
  };
}

describe("pick entry", () => {
  test("a member picks a winner one game at a time and can change it before the deadline", async () => {
    const { db, slate, grandma, michigan, texas, sheet } = await setup();

    expect((await sheet(grandma, THURSDAY)).games).toHaveLength(3);
    expect((await sheet(grandma, THURSDAY)).picks).toEqual([]);

    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    await pickAs(db, grandma, slate, texas, texas.awayTeamId, THURSDAY);
    expect((await sheet(grandma, THURSDAY)).picks.map((p) => [p.gameId, p.teamId])).toEqual([
      [michigan.id, michigan.homeTeamId],
      [texas.id, texas.awayTeamId],
    ]);

    // Changing a pick replaces it; the unpicked game still has no row.
    await pickAs(db, grandma, slate, texas, texas.homeTeamId, new Date("2026-09-10T21:00:00Z"));
    const changed = await sheet(grandma, THURSDAY);
    expect(changed.picks).toHaveLength(2);
    expect(changed.picks.find((p) => p.gameId === texas.id)).toMatchObject({
      teamId: texas.homeTeamId,
      updatedAt: new Date("2026-09-10T21:00:00Z"),
    });
  });

  test("the server clock enforces the deadline on picks, the lock, and the guess", async () => {
    const { db, slate, grandma, michigan, texas, deadline, sheet } = await setup();
    const justBefore = new Date(deadline.getTime() - 1);

    await pickAs(db, grandma, slate, michigan, michigan.awayTeamId, justBefore);
    await lockAs(db, grandma, slate, michigan.id, justBefore);
    await guessAs(db, grandma, slate, 55, justBefore);
    expect((await sheet(grandma, justBefore)).locked).toBe(false);

    // At the deadline itself, and after, every change is refused with the same message.
    for (const late of [deadline, new Date(deadline.getTime() + 3600_000)]) {
      await expect(pickAs(db, grandma, slate, texas, texas.homeTeamId, late)).rejects.toThrow(DeadlinePassed);
      await expect(pickAs(db, grandma, slate, michigan, michigan.homeTeamId, late)).rejects.toThrow(/deadline has passed/i);
      await expect(lockAs(db, grandma, slate, null, late)).rejects.toThrow(DeadlinePassed);
      await expect(guessAs(db, grandma, slate, 60, late)).rejects.toThrow(DeadlinePassed);
    }

    const locked = await sheet(grandma, deadline);
    expect(locked.locked).toBe(true);
    expect(locked.picks.map((p) => p.teamId)).toEqual([michigan.awayTeamId]);
    expect(locked.lock).toEqual({ state: "counts", gameId: michigan.id });
    expect(locked.tiebreakerGuess).toBe(55);
  });

  test("the Lock of the Week sits on one picked game at most and moves when re-chosen", async () => {
    const { db, slate, jonah, grandma, miami, michigan, texas, sheet, fresh } = await setup();

    // A Lock needs a pick to sit on.
    await expect(lockAs(db, grandma, slate, michigan.id, THURSDAY)).rejects.toThrow(/pick/i);
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    await pickAs(db, grandma, slate, texas, texas.homeTeamId, THURSDAY);
    await pickAs(db, grandma, slate, miami, miami.homeTeamId, THURSDAY);

    await lockAs(db, grandma, slate, michigan.id, THURSDAY);
    expect((await sheet(grandma, THURSDAY)).lock).toEqual({ state: "counts", gameId: michigan.id });

    // Choosing another game moves the Lock rather than adding a second one.
    await lockAs(db, grandma, slate, texas.id, THURSDAY);
    expect((await sheet(grandma, THURSDAY)).lock).toEqual({ state: "counts", gameId: texas.id });
    expect(await db.query.locks.findMany()).toHaveLength(1);

    // Each member's Lock is their own.
    await pickAs(db, jonah, slate, michigan, michigan.awayTeamId, THURSDAY);
    await lockAs(db, jonah, slate, michigan.id, THURSDAY);
    expect((await sheet(grandma, THURSDAY)).lock).toEqual({ state: "counts", gameId: texas.id });

    // Voiding a game drops the Lock sitting on it without destroying it: the row stays, the sheet says
    // it is dropped, and the member is free to move it. A void game still cannot take a new one.
    await lockAs(db, grandma, slate, miami.id, THURSDAY);
    await voidGame(db, jonah, miami.id, "Hurricane");
    expect((await sheet(grandma, THURSDAY)).lock).toEqual({ state: "dropped", gameId: miami.id });
    await expect(lockAs(db, grandma, await fresh(), miami.id, THURSDAY)).rejects.toThrow(/void/i);
    await lockAs(db, grandma, await fresh(), texas.id, THURSDAY);
    await lockAs(db, grandma, await fresh(), null, THURSDAY);
    expect((await sheet(grandma, THURSDAY)).lock).toEqual({ state: "none" });
  });

  test("a Dropped Lock counts again when the commissioner restores the game", async () => {
    const { db, slate, jonah, grandma, miami, sheet } = await setup();
    await pickAs(db, grandma, slate, miami, miami.homeTeamId, THURSDAY);
    await lockAs(db, grandma, slate, miami.id, THURSDAY);

    await voidGame(db, jonah, miami.id, "Hurricane");
    expect((await sheet(grandma, THURSDAY)).lock).toEqual({ state: "dropped", gameId: miami.id });

    // The Void never deleted the row, so the restore needs no help from the member.
    await restoreGame(db, jonah, miami.id);
    expect((await sheet(grandma, THURSDAY)).lock).toEqual({ state: "counts", gameId: miami.id });
  });

  test("a member who moves a Dropped Lock keeps the new one when the game is restored", async () => {
    const { db, slate, jonah, grandma, miami, michigan, sheet } = await setup();
    await pickAs(db, grandma, slate, miami, miami.homeTeamId, THURSDAY);
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    await lockAs(db, grandma, slate, miami.id, THURSDAY);
    await voidGame(db, jonah, miami.id, "Hurricane");

    // One Lock per member per week, so moving it overwrites the dropped one and the restore finds nothing to revive.
    await lockAs(db, grandma, slate, michigan.id, THURSDAY);
    await restoreGame(db, jonah, miami.id);
    expect((await sheet(grandma, THURSDAY)).lock).toEqual({ state: "counts", gameId: michigan.id });
    expect(await db.query.locks.findMany()).toHaveLength(1);
  });

  test("a pick must name a team in the game, on a live game, in a published week; a guess is a whole score", async () => {
    const { db, slate, jonah, grandma, miami, michigan, sheet, fresh } = await setup();

    await expect(pickAs(db, grandma, slate, michigan, 999999, THURSDAY)).rejects.toThrow(/one of the two teams/i);

    await voidGame(db, jonah, miami.id, "Hurricane");
    await expect(pickAs(db, grandma, await fresh(), miami, miami.homeTeamId, THURSDAY)).rejects.toThrow(/void/i);

    for (const bad of [-1, 3.5, Number.NaN, 1000]) {
      await expect(guessAs(db, grandma, slate, bad, THURSDAY)).rejects.toThrow(/whole number/i);
    }
    await guessAs(db, grandma, slate, 0, THURSDAY);
    expect((await sheet(grandma, THURSDAY)).tiebreakerGuess).toBe(0);

    // Week 3 exists but is not published: nothing to read and nothing to pick in yet.
    const week3 = await openWeek(db, jonah, 3);
    const unpublished = await slateFor(db, week3.id);
    await expect(pickSheet(db, grandma, unpublished, THURSDAY)).rejects.toThrow(/not published/i);
    await expect(guessAs(db, grandma, unpublished, 40, THURSDAY)).rejects.toThrow(/not published/i);
    // Writing across weeks is no longer expressible, so there is nothing to
    // assert here: the writer decides from the Slate it was handed, and a game
    // from another Week is simply not on it. `edits.test.ts` covers the refusal.
  });
});

describe("one reader for a Week's entries", () => {
  /** A member's entry, by id, from a read that returned them. */
  const of = <E extends { member: { id: number } }>(entries: E[], id: number) => entries.find((e) => e.member.id === id);

  test("an entry is the member's picks in slate order, their Lock in one of three states, their Guess, and what is left", async () => {
    const { db, slate, jonah, grandma, miami, michigan, texas, fresh, board } = await setup();
    // Out of slate order on purpose: the reader puts them back in it.
    await pickAs(db, grandma, slate, texas, texas.homeTeamId, THURSDAY);
    await pickAs(db, grandma, slate, miami, miami.homeTeamId, THURSDAY);
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    await guessAs(db, grandma, slate, 55, THURSDAY);

    const before = of((await weekEntries(db, await fresh(), { chasing: await board() }, THURSDAY)).entries, grandma.id)!;
    expect(before.picks.map((p) => p.gameId)).toEqual(slate.games.map((g) => g.id));
    expect(before.lock).toEqual({ state: "none" });
    expect(before.tiebreakerGuess).toBe(55);
    // Every pick but no Lock is one thing left.
    expect(before.progress).toEqual({ liveGames: 3, picksMade: 3, lockSet: false, guessSet: true, lockOpen: true, remaining: 1 });

    await lockAs(db, grandma, slate, miami.id, THURSDAY);
    const counts = of((await weekEntries(db, await fresh(), { chasing: await board() }, THURSDAY)).entries, grandma.id)!;
    expect(counts.lock).toEqual({ state: "counts", gameId: miami.id });
    expect(counts.progress.remaining).toBe(0);

    // A Void takes its game off the count and drops the Lock on it, so the Lock
    // is one thing left again though the member touched nothing.
    await voidGame(db, jonah, miami.id, "Hurricane");
    const dropped = of((await weekEntries(db, await fresh(), { chasing: await board() }, THURSDAY)).entries, grandma.id)!;
    expect(dropped.lock).toEqual({ state: "dropped", gameId: miami.id });
    expect(dropped.progress).toEqual({ liveGames: 2, picksMade: 2, lockSet: false, guessSet: true, lockOpen: true, remaining: 1 });

    // The member's own sheet is the same entry: one reader, so the two cannot disagree.
    const own = await pickSheet(db, grandma, await fresh(), THURSDAY);
    expect({ picks: own.picks, lock: own.lock, tiebreakerGuess: own.tiebreakerGuess, progress: own.progress }).toEqual({
      picks: dropped.picks,
      lock: dropped.lock,
      tiebreakerGuess: dropped.tiebreakerGuess,
      progress: dropped.progress,
    });
  });

  test("a board is hidden before the Deadline for everyone; a member's own entry and the chase are not", async () => {
    const { db, slate, grandma, michigan, deadline, fresh, board } = await setup();
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    const justBefore = new Date(deadline.getTime() - 1);

    // No actor to check: the Reveal's gate is not keyed to who is asking, commissioners included.
    await expect(weekEntries(db, await fresh(), { board: await board() }, justBefore)).rejects.toThrow(PicksHidden);
    await expect(weekEntries(db, await fresh(), { board: await board() }, justBefore)).rejects.toThrow(/deadline/i);

    const own = await weekEntries(db, await fresh(), { own: grandma }, justBefore);
    expect(own.locked).toBe(false);
    expect(own.deadline).toEqual(deadline);
    expect(own.entries.map((e) => e.picks.length)).toEqual([1]);
    expect(of((await weekEntries(db, await fresh(), { chasing: await board() }, justBefore)).entries, grandma.id)!.picks).toHaveLength(1);

    const revealed = await weekEntries(db, await fresh(), { board: await board() }, deadline);
    expect(revealed.locked).toBe(true);
    expect(of(revealed.entries, grandma.id)!.picks).toHaveLength(1);
  });

  test("the reason for the read decides who the Week counts", async () => {
    const { db, slate, jonah, grandma, michigan, deadline, fresh, board, everyone } = await setup();
    // Late joins after the Deadline: there was never a week for them to miss.
    const late = await joinAt(db, jonah, "Late", new Date(deadline.getTime() + 3600_000));
    // Gone picked, then left: their points happened, but there is nobody to chase.
    const gone = await joinAt(db, jonah, "Gone", TUESDAY);
    await pickAs(db, gone, slate, michigan, michigan.homeTeamId, THURSDAY);
    await setMemberActive(db, jonah, gone.id, false);
    // Quiet was deactivated without ever picking: on nothing.
    const quiet = await joinAt(db, jonah, "Quiet", TUESDAY);
    await setMemberActive(db, jonah, quiet.id, false);
    // Blank is here and picked nothing: a blank week is an entry, not an absence.
    const blank = await joinAt(db, jonah, "Blank", TUESDAY);

    const ids = (entries: { member: { id: number } }[]) => entries.map((e) => e.member.id).sort();
    const revealed = (await weekEntries(db, await fresh(), { board: await board() }, deadline)).entries;
    expect(ids(revealed)).toEqual([jonah.id, grandma.id, gone.id, blank.id].sort());
    expect(of(revealed, blank.id)).toMatchObject({ picks: [], lock: { state: "none" }, tiebreakerGuess: null });

    const chased = (await weekEntries(db, await fresh(), { chasing: await everyone() }, deadline)).entries;
    expect(ids(chased)).toEqual([jonah.id, grandma.id, blank.id].sort());

    // Their own sheet is theirs whatever the roster says.
    const own = (await weekEntries(db, await fresh(), { own: late }, deadline)).entries;
    expect(ids(own)).toEqual([late.id]);
    expect(of(revealed, quiet.id)).toBeUndefined();
  });

  test("a season is the board a Week at a time, in one read, and refused while any Week is open", async () => {
    const { db, slate, jonah, grandma, michigan, deadline, board } = await setup();
    const { week } = slate;
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    await lockAs(db, grandma, slate, michigan.id, THURSDAY);
    const weekGames = [{ week, games: slate.games }];

    await expect(seasonEntries(db, await board(), weekGames, THURSDAY)).rejects.toThrow(PicksHidden);

    const season = await seasonEntries(db, await board(), weekGames, deadline);
    const reveal = (await weekEntries(db, slate, { board: await board() }, deadline)).entries;
    // The same fold as one Week's board, so the Leaderboard and the Reveal agree.
    expect(season.get(week.id)).toEqual(reveal);
    expect(of(season.get(week.id)!, grandma.id)!.lock).toEqual({ state: "counts", gameId: michigan.id });
    expect(of(season.get(week.id)!, jonah.id)!.picks).toEqual([]);
  });
});
