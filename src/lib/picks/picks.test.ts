import { describe, expect, test } from "vitest";
import { seasons } from "@/db/schema";
import { recordedCfbd } from "@/lib/cfbd/recorded";
import { weekCandidates } from "@/lib/cfbd/candidates";
import { addMember, bootstrapCommissioner, setMemberActive } from "@/lib/members/members";
import { addGame, openWeek, publishSlate, setTiebreaker, voidGame } from "@/lib/slate/slate";
import { createTestDb } from "@/test/db";
import {
  DeadlinePassed,
  pickSheet,
  PicksHidden,
  savePick,
  setLock,
  setTiebreakerGuess,
  weekPicks,
} from "./picks";

const OHIO_STATE_AT_TEXAS = 401856682; // Sat 2026-09-12 23:30Z
const OKLAHOMA_AT_MICHIGAN = 401856679; // Sat 2026-09-12 16:00Z
const FAMU_AT_FLORIDA = 401858213;
const TUESDAY = new Date("2026-09-08T18:00:00Z");
const THURSDAY = new Date("2026-09-10T20:00:00Z");

/** A published Week 2 slate of three games with the Texas game as the Tiebreaker Game. */
async function setup() {
  const db = await createTestDb();
  await db.insert(seasons).values({ year: 2026, rules: { pointsPerCorrectPick: 10, lockMultiplier: 2 }, active: true });
  const jonah = await bootstrapCommissioner(db, { displayName: "Jonah" });
  const grandma = await addMember(db, jonah, { displayName: "Grandma" });
  const candidates = await weekCandidates(recordedCfbd("2026-week-2"), { year: 2026, week: 2 });
  const candidate = (id: number) => candidates.find((c) => c.cfbdGameId === id)!;
  const week = await openWeek(db, jonah, 2);
  const michigan = await addGame(db, jonah, week.id, candidate(OKLAHOMA_AT_MICHIGAN));
  const texas = await addGame(db, jonah, week.id, candidate(OHIO_STATE_AT_TEXAS));
  const florida = await addGame(db, jonah, week.id, candidate(FAMU_AT_FLORIDA));
  await setTiebreaker(db, jonah, week.id, texas.id);
  const slate = await publishSlate(db, jonah, week.id, TUESDAY);
  return { db, jonah, grandma, week, michigan, texas, florida, deadline: slate.deadline! };
}

describe("pick entry", () => {
  test("a member picks a winner one game at a time and can change it before the deadline", async () => {
    const { db, grandma, week, michigan, texas } = await setup();

    let sheet = await pickSheet(db, grandma, week.id, THURSDAY);
    expect(sheet.games).toHaveLength(3);
    expect(sheet.picks).toEqual([]);

    await savePick(db, grandma, week.id, michigan.id, michigan.homeTeamId, THURSDAY);
    await savePick(db, grandma, week.id, texas.id, texas.awayTeamId, THURSDAY);
    sheet = await pickSheet(db, grandma, week.id, THURSDAY);
    expect(sheet.picks.map((p) => [p.gameId, p.teamId])).toEqual([
      [michigan.id, michigan.homeTeamId],
      [texas.id, texas.awayTeamId],
    ]);

    // Changing a pick replaces it; the unpicked game still has no row.
    await savePick(db, grandma, week.id, texas.id, texas.homeTeamId, new Date("2026-09-10T21:00:00Z"));
    sheet = await pickSheet(db, grandma, week.id, THURSDAY);
    expect(sheet.picks).toHaveLength(2);
    expect(sheet.picks.find((p) => p.gameId === texas.id)).toMatchObject({
      teamId: texas.homeTeamId,
      updatedAt: new Date("2026-09-10T21:00:00Z"),
    });
  });

  test("the server clock enforces the deadline on picks, the lock, and the guess", async () => {
    const { db, grandma, week, michigan, texas, deadline } = await setup();
    const justBefore = new Date(deadline.getTime() - 1);

    await savePick(db, grandma, week.id, michigan.id, michigan.awayTeamId, justBefore);
    await setLock(db, grandma, week.id, michigan.id, justBefore);
    await setTiebreakerGuess(db, grandma, week.id, 55, justBefore);
    expect((await pickSheet(db, grandma, week.id, justBefore)).locked).toBe(false);

    // At the deadline itself, and after, every change is refused with the same message.
    for (const late of [deadline, new Date(deadline.getTime() + 3600_000)]) {
      await expect(savePick(db, grandma, week.id, texas.id, texas.homeTeamId, late)).rejects.toThrow(DeadlinePassed);
      await expect(savePick(db, grandma, week.id, michigan.id, michigan.homeTeamId, late)).rejects.toThrow(/deadline has passed/i);
      await expect(setLock(db, grandma, week.id, null, late)).rejects.toThrow(DeadlinePassed);
      await expect(setTiebreakerGuess(db, grandma, week.id, 60, late)).rejects.toThrow(DeadlinePassed);
    }

    const sheet = await pickSheet(db, grandma, week.id, deadline);
    expect(sheet.locked).toBe(true);
    expect(sheet.picks.map((p) => p.teamId)).toEqual([michigan.awayTeamId]);
    expect(sheet.lockGameId).toBe(michigan.id);
    expect(sheet.tiebreakerGuess).toBe(55);
  });

  test("the Lock of the Week sits on one picked game at most and moves when re-chosen", async () => {
    const { db, jonah, grandma, week, michigan, texas, florida } = await setup();

    // A Lock needs a pick to sit on.
    await expect(setLock(db, grandma, week.id, michigan.id, THURSDAY)).rejects.toThrow(/pick/i);
    await savePick(db, grandma, week.id, michigan.id, michigan.homeTeamId, THURSDAY);
    await savePick(db, grandma, week.id, texas.id, texas.homeTeamId, THURSDAY);
    await savePick(db, grandma, week.id, florida.id, florida.homeTeamId, THURSDAY);

    await setLock(db, grandma, week.id, michigan.id, THURSDAY);
    expect((await pickSheet(db, grandma, week.id, THURSDAY)).lockGameId).toBe(michigan.id);

    // Choosing another game moves the Lock rather than adding a second one.
    await setLock(db, grandma, week.id, texas.id, THURSDAY);
    expect((await pickSheet(db, grandma, week.id, THURSDAY)).lockGameId).toBe(texas.id);
    expect(await db.query.locks.findMany()).toHaveLength(1);

    // Each member's Lock is their own.
    await savePick(db, jonah, week.id, michigan.id, michigan.awayTeamId, THURSDAY);
    await setLock(db, jonah, week.id, michigan.id, THURSDAY);
    expect((await pickSheet(db, grandma, week.id, THURSDAY)).lockGameId).toBe(texas.id);

    // Voiding a game drops any Lock sitting on it, so the member can lock another; and a void game cannot take one.
    await setLock(db, grandma, week.id, florida.id, THURSDAY);
    await voidGame(db, jonah, florida.id, "Hurricane");
    expect((await pickSheet(db, grandma, week.id, THURSDAY)).lockGameId).toBeNull();
    await expect(setLock(db, grandma, week.id, florida.id, THURSDAY)).rejects.toThrow(/void/i);
    await setLock(db, grandma, week.id, texas.id, THURSDAY);
    await setLock(db, grandma, week.id, null, THURSDAY);
    expect((await pickSheet(db, grandma, week.id, THURSDAY)).lockGameId).toBeNull();
  });

  test("nobody reads another member's picks before the deadline, commissioners included", async () => {
    const { db, jonah, grandma, week, michigan, texas, deadline } = await setup();
    await savePick(db, grandma, week.id, michigan.id, michigan.homeTeamId, THURSDAY);
    await savePick(db, grandma, week.id, texas.id, texas.awayTeamId, THURSDAY);
    await setLock(db, grandma, week.id, texas.id, THURSDAY);
    await setTiebreakerGuess(db, grandma, week.id, 48, THURSDAY);
    await savePick(db, jonah, week.id, michigan.id, michigan.awayTeamId, THURSDAY);

    const justBefore = new Date(deadline.getTime() - 1);
    await expect(weekPicks(db, jonah, week.id, justBefore)).rejects.toThrow(PicksHidden);
    await expect(weekPicks(db, grandma, week.id, justBefore)).rejects.toThrow(/deadline/i);

    // The member's own sheet is never hidden from them.
    expect((await pickSheet(db, grandma, week.id, justBefore)).picks).toHaveLength(2);

    // The Reveal: at the deadline every member's picks are readable by every member,
    // including a member who entered nothing, but not a deactivated one.
    const alex = await addMember(db, jonah, { displayName: "Alex" });
    const gone = await addMember(db, jonah, { displayName: "Gone" });
    await setMemberActive(db, jonah, gone.id, false);
    const revealed = await weekPicks(db, grandma, week.id, deadline);
    expect(revealed.map((m) => m.memberId).sort()).toEqual([jonah.id, grandma.id, alex.id].sort());
    expect(revealed.find((m) => m.memberId === alex.id)).toEqual({
      memberId: alex.id,
      picks: [],
      lockGameId: null,
      tiebreakerGuess: null,
    });
    expect(revealed.find((m) => m.memberId === grandma.id)).toMatchObject({
      picks: [
        { gameId: michigan.id, teamId: michigan.homeTeamId },
        { gameId: texas.id, teamId: texas.awayTeamId },
      ],
      lockGameId: texas.id,
      tiebreakerGuess: 48,
    });
    expect(revealed.find((m) => m.memberId === jonah.id)).toMatchObject({
      picks: [{ gameId: michigan.id, teamId: michigan.awayTeamId }],
      lockGameId: null,
      tiebreakerGuess: null,
    });
  });

  test("a pick must name a team in the game, on a live game, in a published week; a guess is a whole score", async () => {
    const { db, jonah, grandma, week, michigan, florida } = await setup();

    await expect(savePick(db, grandma, week.id, michigan.id, 999999, THURSDAY)).rejects.toThrow(/one of the two teams/i);
    await expect(savePick(db, grandma, week.id, 999999, michigan.homeTeamId, THURSDAY)).rejects.toThrow(/not on the slate/i);
    // A game from another week is refused even if it exists, so a stale screen cannot write across weeks.
    const otherWeek = await openWeek(db, jonah, 3);
    await expect(savePick(db, grandma, otherWeek.id, michigan.id, michigan.homeTeamId, THURSDAY)).rejects.toThrow(
      /not on this week/i,
    );

    await voidGame(db, jonah, florida.id, "Hurricane");
    await expect(savePick(db, grandma, week.id, florida.id, florida.homeTeamId, THURSDAY)).rejects.toThrow(/void/i);

    for (const bad of [-1, 3.5, Number.NaN, 1000]) {
      await expect(setTiebreakerGuess(db, grandma, week.id, bad, THURSDAY)).rejects.toThrow(/whole number/i);
    }
    await setTiebreakerGuess(db, grandma, week.id, 0, THURSDAY);
    expect((await pickSheet(db, grandma, week.id, THURSDAY)).tiebreakerGuess).toBe(0);

    // Week 3 exists but is not published: nothing to pick in yet.
    const week3 = await openWeek(db, jonah, 3);
    await expect(pickSheet(db, grandma, week3.id, THURSDAY)).rejects.toThrow(/not published/i);
    await expect(setTiebreakerGuess(db, grandma, week3.id, 40, THURSDAY)).rejects.toThrow(/not published/i);
  });
});
