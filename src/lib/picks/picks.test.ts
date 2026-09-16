import { describe, expect, test } from "vitest";
import type { Member } from "@/db/schema";
import { setMemberActive } from "@/lib/members/members";
import { restoreGame } from "@/lib/results/results";
import { openWeek, slateFor, voidGame } from "@/lib/slate/slate";
import { guessAs, joinAt, lockAs, pickAs, publishWeek2, THURSDAY, TUESDAY } from "@/test/week-2";
import { DeadlinePassed, pickSheet, PicksHidden, weekPicks } from "./picks";

/**
 * The shared published Week 2, plus readers that re-read the Slate each time:
 * `pickSheet` and `weekPicks` take the Week as loaded rows now, and a void or
 * a restore in the middle of a test moves them.
 */
async function setup() {
  const fixture = await publishWeek2();
  const { db, week } = fixture;
  return {
    ...fixture,
    fresh: () => slateFor(db, week.id),
    sheet: async (actor: Member, at: Date) => pickSheet(db, actor, await slateFor(db, week.id), at),
    revealed: async (at: Date) => weekPicks(db, await slateFor(db, week.id), at),
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
    expect(locked.lockGameId).toBe(michigan.id);
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
    expect((await sheet(grandma, THURSDAY)).lockGameId).toBe(michigan.id);

    // Choosing another game moves the Lock rather than adding a second one.
    await lockAs(db, grandma, slate, texas.id, THURSDAY);
    expect((await sheet(grandma, THURSDAY)).lockGameId).toBe(texas.id);
    expect(await db.query.locks.findMany()).toHaveLength(1);

    // Each member's Lock is their own.
    await pickAs(db, jonah, slate, michigan, michigan.awayTeamId, THURSDAY);
    await lockAs(db, jonah, slate, michigan.id, THURSDAY);
    expect((await sheet(grandma, THURSDAY)).lockGameId).toBe(texas.id);

    // Voiding a game drops the Lock sitting on it without destroying it: the row stays, the sheet says
    // it is dropped, and the member is free to move it. A void game still cannot take a new one.
    await lockAs(db, grandma, slate, miami.id, THURSDAY);
    await voidGame(db, jonah, miami.id, "Hurricane");
    const dropped = await sheet(grandma, THURSDAY);
    expect(dropped.lockGameId).toBe(miami.id);
    expect(dropped.lockDropped).toBe(true);
    await expect(lockAs(db, grandma, await fresh(), miami.id, THURSDAY)).rejects.toThrow(/void/i);
    await lockAs(db, grandma, await fresh(), texas.id, THURSDAY);
    await lockAs(db, grandma, await fresh(), null, THURSDAY);
    expect((await sheet(grandma, THURSDAY)).lockGameId).toBeNull();
  });

  test("a Dropped Lock counts again when the commissioner restores the game", async () => {
    const { db, slate, jonah, grandma, miami, sheet } = await setup();
    await pickAs(db, grandma, slate, miami, miami.homeTeamId, THURSDAY);
    await lockAs(db, grandma, slate, miami.id, THURSDAY);

    await voidGame(db, jonah, miami.id, "Hurricane");
    expect((await sheet(grandma, THURSDAY)).lockDropped).toBe(true);

    // The Void never deleted the row, so the restore needs no help from the member.
    await restoreGame(db, jonah, miami.id);
    const restored = await sheet(grandma, THURSDAY);
    expect(restored.lockGameId).toBe(miami.id);
    expect(restored.lockDropped).toBe(false);
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
    const moved = await sheet(grandma, THURSDAY);
    expect(moved.lockGameId).toBe(michigan.id);
    expect(moved.lockDropped).toBe(false);
    expect(await db.query.locks.findMany()).toHaveLength(1);
  });

  test("the sheet counts what is left, and every pick but no Lock has one thing left", async () => {
    const { db, slate, jonah, grandma, miami, michigan, texas, sheet } = await setup();
    expect((await sheet(grandma, THURSDAY)).progress).toEqual({
      liveGames: 3,
      picksMade: 0,
      lockSet: false,
      guessSet: false,
      lockOpen: true,
      remaining: 3,
    });

    for (const game of [michigan, texas, miami]) {
      await pickAs(db, grandma, slate, game, game.homeTeamId, THURSDAY);
    }
    await guessAs(db, grandma, slate, 55, THURSDAY);
    expect((await sheet(grandma, THURSDAY)).progress).toEqual({
      liveGames: 3,
      picksMade: 3,
      lockSet: false,
      guessSet: true,
      lockOpen: true,
      remaining: 1,
    });

    await lockAs(db, grandma, slate, miami.id, THURSDAY);
    expect((await sheet(grandma, THURSDAY)).progress.remaining).toBe(0);

    // A Void takes its game off the count and drops the Lock sitting on it, so the
    // Lock is one thing left again even though the member never touched anything.
    await voidGame(db, jonah, miami.id, "Hurricane");
    expect((await sheet(grandma, THURSDAY)).progress).toEqual({
      liveGames: 2,
      picksMade: 2,
      lockSet: false,
      guessSet: true,
      lockOpen: true,
      remaining: 1,
    });
  });

  test("nobody reads another member's picks before the deadline, commissioners included", async () => {
    const { db, slate, jonah, grandma, michigan, texas, deadline, sheet, revealed } = await setup();
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    await pickAs(db, grandma, slate, texas, texas.awayTeamId, THURSDAY);
    await lockAs(db, grandma, slate, texas.id, THURSDAY);
    await guessAs(db, grandma, slate, 48, THURSDAY);
    await pickAs(db, jonah, slate, michigan, michigan.awayTeamId, THURSDAY);

    // Hidden before the Deadline for everyone, commissioners included — which
    // the signature now says outright: the Reveal takes no actor to check.
    const justBefore = new Date(deadline.getTime() - 1);
    await expect(revealed(justBefore)).rejects.toThrow(PicksHidden);
    await expect(revealed(justBefore)).rejects.toThrow(/deadline/i);

    // The member's own sheet is never hidden from them.
    expect((await sheet(grandma, justBefore)).picks).toHaveLength(2);

    // The Reveal: at the deadline every member's picks are readable by every member,
    // including a member who entered nothing, but not a deactivated one.
    const alex = await joinAt(db, jonah, "Alex", TUESDAY);
    const gone = await joinAt(db, jonah, "Gone", TUESDAY);
    await setMemberActive(db, jonah, gone.id, false);
    const board = await revealed(deadline);
    expect(board.map((m) => m.memberId).sort()).toEqual([jonah.id, grandma.id, alex.id].sort());
    expect(board.find((m) => m.memberId === alex.id)).toEqual({
      memberId: alex.id,
      picks: [],
      lockGameId: null,
      tiebreakerGuess: null,
    });
    expect(board.find((m) => m.memberId === grandma.id)).toMatchObject({
      picks: [
        { gameId: michigan.id, teamId: michigan.homeTeamId },
        { gameId: texas.id, teamId: texas.awayTeamId },
      ],
      lockGameId: texas.id,
      tiebreakerGuess: 48,
    });
    expect(board.find((m) => m.memberId === jonah.id)).toMatchObject({
      picks: [{ gameId: michigan.id, teamId: michigan.awayTeamId }],
      lockGameId: null,
      tiebreakerGuess: null,
    });
  });

  test("the Reveal board is the roster: nobody who joined late, and the deactivated only if they picked", async () => {
    const { db, slate, jonah, grandma, michigan, deadline, revealed } = await setup();

    // Late joins the Monday after the Deadline: there was never a week for
    // them to miss, and a name with no picks on the board is the bug.
    const late = await joinAt(db, jonah, "Late", new Date(deadline.getTime() + 3600_000));
    // Gone picked, then left. Their points happened, so the board still owes them a row.
    const gone = await joinAt(db, jonah, "Gone", TUESDAY);
    await pickAs(db, gone, slate, michigan, michigan.homeTeamId, THURSDAY);
    await setMemberActive(db, jonah, gone.id, false);
    // Quiet was deactivated without ever picking: nothing of theirs to show.
    const quiet = await joinAt(db, jonah, "Quiet", TUESDAY);
    await setMemberActive(db, jonah, quiet.id, false);

    const board = await revealed(deadline);

    expect(board.map((m) => m.memberId).sort()).toEqual([jonah.id, grandma.id, gone.id].sort());
    expect(board.find((m) => m.memberId === late.id)).toBeUndefined();
    expect(board.find((m) => m.memberId === quiet.id)).toBeUndefined();
    expect(board.find((m) => m.memberId === gone.id)).toMatchObject({
      picks: [{ gameId: michigan.id, teamId: michigan.homeTeamId }],
    });
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
