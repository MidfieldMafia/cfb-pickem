import { describe, expect, test } from "vitest";
import type { Member } from "@/db/schema";
import { addMember, setMemberActive } from "@/lib/members/members";
import { restoreGame } from "@/lib/results/results";
import { openWeek, slateFor, voidGame } from "@/lib/slate/slate";
import { publishWeek2, THURSDAY } from "@/test/week-2";
import {
  DeadlinePassed,
  pickSheet,
  PicksHidden,
  savePick,
  setLock,
  setTiebreakerGuess,
  weekPicks,
} from "./picks";

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
    sheet: async (actor: Member, at: Date) => pickSheet(db, actor, await slateFor(db, week.id), at),
    revealed: async (actor: Member, at: Date) => weekPicks(db, actor, await slateFor(db, week.id), at),
  };
}

describe("pick entry", () => {
  test("a member picks a winner one game at a time and can change it before the deadline", async () => {
    const { db, grandma, week, michigan, texas, sheet } = await setup();

    expect((await sheet(grandma, THURSDAY)).games).toHaveLength(3);
    expect((await sheet(grandma, THURSDAY)).picks).toEqual([]);

    await savePick(db, grandma, week.id, michigan.id, michigan.homeTeamId, THURSDAY);
    await savePick(db, grandma, week.id, texas.id, texas.awayTeamId, THURSDAY);
    expect((await sheet(grandma, THURSDAY)).picks.map((p) => [p.gameId, p.teamId])).toEqual([
      [michigan.id, michigan.homeTeamId],
      [texas.id, texas.awayTeamId],
    ]);

    // Changing a pick replaces it; the unpicked game still has no row.
    await savePick(db, grandma, week.id, texas.id, texas.homeTeamId, new Date("2026-09-10T21:00:00Z"));
    const changed = await sheet(grandma, THURSDAY);
    expect(changed.picks).toHaveLength(2);
    expect(changed.picks.find((p) => p.gameId === texas.id)).toMatchObject({
      teamId: texas.homeTeamId,
      updatedAt: new Date("2026-09-10T21:00:00Z"),
    });
  });

  test("the server clock enforces the deadline on picks, the lock, and the guess", async () => {
    const { db, grandma, week, michigan, texas, deadline, sheet } = await setup();
    const justBefore = new Date(deadline.getTime() - 1);

    await savePick(db, grandma, week.id, michigan.id, michigan.awayTeamId, justBefore);
    await setLock(db, grandma, week.id, michigan.id, justBefore);
    await setTiebreakerGuess(db, grandma, week.id, 55, justBefore);
    expect((await sheet(grandma, justBefore)).locked).toBe(false);

    // At the deadline itself, and after, every change is refused with the same message.
    for (const late of [deadline, new Date(deadline.getTime() + 3600_000)]) {
      await expect(savePick(db, grandma, week.id, texas.id, texas.homeTeamId, late)).rejects.toThrow(DeadlinePassed);
      await expect(savePick(db, grandma, week.id, michigan.id, michigan.homeTeamId, late)).rejects.toThrow(/deadline has passed/i);
      await expect(setLock(db, grandma, week.id, null, late)).rejects.toThrow(DeadlinePassed);
      await expect(setTiebreakerGuess(db, grandma, week.id, 60, late)).rejects.toThrow(DeadlinePassed);
    }

    const locked = await sheet(grandma, deadline);
    expect(locked.locked).toBe(true);
    expect(locked.picks.map((p) => p.teamId)).toEqual([michigan.awayTeamId]);
    expect(locked.lockGameId).toBe(michigan.id);
    expect(locked.tiebreakerGuess).toBe(55);
  });

  test("the Lock of the Week sits on one picked game at most and moves when re-chosen", async () => {
    const { db, jonah, grandma, week, miami, michigan, texas, sheet } = await setup();

    // A Lock needs a pick to sit on.
    await expect(setLock(db, grandma, week.id, michigan.id, THURSDAY)).rejects.toThrow(/pick/i);
    await savePick(db, grandma, week.id, michigan.id, michigan.homeTeamId, THURSDAY);
    await savePick(db, grandma, week.id, texas.id, texas.homeTeamId, THURSDAY);
    await savePick(db, grandma, week.id, miami.id, miami.homeTeamId, THURSDAY);

    await setLock(db, grandma, week.id, michigan.id, THURSDAY);
    expect((await sheet(grandma, THURSDAY)).lockGameId).toBe(michigan.id);

    // Choosing another game moves the Lock rather than adding a second one.
    await setLock(db, grandma, week.id, texas.id, THURSDAY);
    expect((await sheet(grandma, THURSDAY)).lockGameId).toBe(texas.id);
    expect(await db.query.locks.findMany()).toHaveLength(1);

    // Each member's Lock is their own.
    await savePick(db, jonah, week.id, michigan.id, michigan.awayTeamId, THURSDAY);
    await setLock(db, jonah, week.id, michigan.id, THURSDAY);
    expect((await sheet(grandma, THURSDAY)).lockGameId).toBe(texas.id);

    // Voiding a game drops the Lock sitting on it without destroying it: the row stays, the sheet says
    // it is dropped, and the member is free to move it. A void game still cannot take a new one.
    await setLock(db, grandma, week.id, miami.id, THURSDAY);
    await voidGame(db, jonah, miami.id, "Hurricane");
    const dropped = await sheet(grandma, THURSDAY);
    expect(dropped.lockGameId).toBe(miami.id);
    expect(dropped.lockDropped).toBe(true);
    await expect(setLock(db, grandma, week.id, miami.id, THURSDAY)).rejects.toThrow(/void/i);
    await setLock(db, grandma, week.id, texas.id, THURSDAY);
    await setLock(db, grandma, week.id, null, THURSDAY);
    expect((await sheet(grandma, THURSDAY)).lockGameId).toBeNull();
  });

  test("a Dropped Lock counts again when the commissioner restores the game", async () => {
    const { db, jonah, grandma, week, miami, sheet } = await setup();
    await savePick(db, grandma, week.id, miami.id, miami.homeTeamId, THURSDAY);
    await setLock(db, grandma, week.id, miami.id, THURSDAY);

    await voidGame(db, jonah, miami.id, "Hurricane");
    expect((await sheet(grandma, THURSDAY)).lockDropped).toBe(true);

    // The Void never deleted the row, so the restore needs no help from the member.
    await restoreGame(db, jonah, miami.id);
    const restored = await sheet(grandma, THURSDAY);
    expect(restored.lockGameId).toBe(miami.id);
    expect(restored.lockDropped).toBe(false);
  });

  test("a member who moves a Dropped Lock keeps the new one when the game is restored", async () => {
    const { db, jonah, grandma, week, miami, michigan, sheet } = await setup();
    await savePick(db, grandma, week.id, miami.id, miami.homeTeamId, THURSDAY);
    await savePick(db, grandma, week.id, michigan.id, michigan.homeTeamId, THURSDAY);
    await setLock(db, grandma, week.id, miami.id, THURSDAY);
    await voidGame(db, jonah, miami.id, "Hurricane");

    // One Lock per member per week, so moving it overwrites the dropped one and the restore finds nothing to revive.
    await setLock(db, grandma, week.id, michigan.id, THURSDAY);
    await restoreGame(db, jonah, miami.id);
    const moved = await sheet(grandma, THURSDAY);
    expect(moved.lockGameId).toBe(michigan.id);
    expect(moved.lockDropped).toBe(false);
    expect(await db.query.locks.findMany()).toHaveLength(1);
  });

  test("the sheet counts what is left, and every pick but no Lock has one thing left", async () => {
    const { db, jonah, grandma, week, miami, michigan, texas, sheet } = await setup();
    expect((await sheet(grandma, THURSDAY)).progress).toEqual({
      liveGames: 3,
      picksMade: 0,
      lockSet: false,
      guessSet: false,
      remaining: 3,
    });

    for (const game of [michigan, texas, miami]) {
      await savePick(db, grandma, week.id, game.id, game.homeTeamId, THURSDAY);
    }
    await setTiebreakerGuess(db, grandma, week.id, 55, THURSDAY);
    expect((await sheet(grandma, THURSDAY)).progress).toEqual({
      liveGames: 3,
      picksMade: 3,
      lockSet: false,
      guessSet: true,
      remaining: 1,
    });

    await setLock(db, grandma, week.id, miami.id, THURSDAY);
    expect((await sheet(grandma, THURSDAY)).progress.remaining).toBe(0);

    // A Void takes its game off the count and drops the Lock sitting on it, so the
    // Lock is one thing left again even though the member never touched anything.
    await voidGame(db, jonah, miami.id, "Hurricane");
    expect((await sheet(grandma, THURSDAY)).progress).toEqual({
      liveGames: 2,
      picksMade: 2,
      lockSet: false,
      guessSet: true,
      remaining: 1,
    });
  });

  test("nobody reads another member's picks before the deadline, commissioners included", async () => {
    const { db, jonah, grandma, week, michigan, texas, deadline, sheet, revealed } = await setup();
    await savePick(db, grandma, week.id, michigan.id, michigan.homeTeamId, THURSDAY);
    await savePick(db, grandma, week.id, texas.id, texas.awayTeamId, THURSDAY);
    await setLock(db, grandma, week.id, texas.id, THURSDAY);
    await setTiebreakerGuess(db, grandma, week.id, 48, THURSDAY);
    await savePick(db, jonah, week.id, michigan.id, michigan.awayTeamId, THURSDAY);

    const justBefore = new Date(deadline.getTime() - 1);
    await expect(revealed(jonah, justBefore)).rejects.toThrow(PicksHidden);
    await expect(revealed(grandma, justBefore)).rejects.toThrow(/deadline/i);

    // The member's own sheet is never hidden from them.
    expect((await sheet(grandma, justBefore)).picks).toHaveLength(2);

    // The Reveal: at the deadline every member's picks are readable by every member,
    // including a member who entered nothing, but not a deactivated one.
    const alex = await addMember(db, jonah, { displayName: "Alex" });
    const gone = await addMember(db, jonah, { displayName: "Gone" });
    await setMemberActive(db, jonah, gone.id, false);
    const board = await revealed(grandma, deadline);
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

  test("a pick must name a team in the game, on a live game, in a published week; a guess is a whole score", async () => {
    const { db, jonah, grandma, week, miami, michigan, sheet } = await setup();

    await expect(savePick(db, grandma, week.id, michigan.id, 999999, THURSDAY)).rejects.toThrow(/one of the two teams/i);
    await expect(savePick(db, grandma, week.id, 999999, michigan.homeTeamId, THURSDAY)).rejects.toThrow(/not on the slate/i);
    // A game from another week is refused even if it exists, so a stale screen cannot write across weeks.
    const otherWeek = await openWeek(db, jonah, 3);
    await expect(savePick(db, grandma, otherWeek.id, michigan.id, michigan.homeTeamId, THURSDAY)).rejects.toThrow(
      /not on this week/i,
    );

    await voidGame(db, jonah, miami.id, "Hurricane");
    await expect(savePick(db, grandma, week.id, miami.id, miami.homeTeamId, THURSDAY)).rejects.toThrow(/void/i);

    for (const bad of [-1, 3.5, Number.NaN, 1000]) {
      await expect(setTiebreakerGuess(db, grandma, week.id, bad, THURSDAY)).rejects.toThrow(/whole number/i);
    }
    await setTiebreakerGuess(db, grandma, week.id, 0, THURSDAY);
    expect((await sheet(grandma, THURSDAY)).tiebreakerGuess).toBe(0);

    // Week 3 exists but is not published: nothing to pick in yet.
    const week3 = await openWeek(db, jonah, 3);
    await expect(pickSheet(db, grandma, await slateFor(db, week3.id), THURSDAY)).rejects.toThrow(/not published/i);
    await expect(setTiebreakerGuess(db, grandma, week3.id, 40, THURSDAY)).rejects.toThrow(/not published/i);
  });
});
