import { describe, expect, test } from "vitest";
import { addMember, NotCommissioner, setMemberActive } from "@/lib/members/members";
import { addGame, openWeek, publishSlate, setTiebreaker, voidGame } from "@/lib/slate/slate";
import { FAMU_AT_MIAMI, OHIO_STATE_AT_TEXAS, OKLAHOMA_AT_MICHIGAN, seedWeek2 } from "@/test/week-2";
import {
  memberSheet,
  overrideLock,
  overridePick,
  overrideTiebreakerGuess,
  pickAuditsFor,
  reminderText,
  whoHasntPicked,
} from "./console";
import { pickSheet, savePick, setLock, setTiebreakerGuess } from "./picks";

const TUESDAY = new Date("2026-09-08T18:00:00Z");
const THURSDAY = new Date("2026-09-10T20:00:00Z");

/** A published Week 2 slate of three games with the Texas game as the Tiebreaker Game. */
async function setup() {
  const { db, jonah, grandma, candidate } = await seedWeek2();
  const week = await openWeek(db, jonah, 2);
  const michigan = await addGame(db, jonah, week.id, candidate(OKLAHOMA_AT_MICHIGAN));
  const texas = await addGame(db, jonah, week.id, candidate(OHIO_STATE_AT_TEXAS));
  const florida = await addGame(db, jonah, week.id, candidate(FAMU_AT_MIAMI));
  await setTiebreaker(db, jonah, week.id, texas.id);
  const slate = await publishSlate(db, jonah, week.id, TUESDAY);
  const deadline = slate.deadline!;
  return { db, jonah, grandma, week, michigan, texas, florida, deadline, afterDeadline: new Date(deadline.getTime() + 3600_000) };
}

describe("commissioner pick override", () => {
  test("a commissioner changes a member's pick after the deadline; a member cannot; the edit is audited", async () => {
    const { db, jonah, grandma, week, michigan, afterDeadline } = await setup();
    await savePick(db, grandma, week.id, michigan.id, michigan.homeTeamId, THURSDAY);

    await expect(
      overridePick(db, grandma, grandma.id, week.id, michigan.id, michigan.awayTeamId, afterDeadline),
    ).rejects.toBeInstanceOf(NotCommissioner);

    await overridePick(db, jonah, grandma.id, week.id, michigan.id, michigan.awayTeamId, afterDeadline);

    const sheet = await pickSheet(db, grandma, week.id, afterDeadline);
    expect(sheet.picks).toEqual([{ gameId: michigan.id, teamId: michigan.awayTeamId, updatedAt: afterDeadline }]);

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
      changedAt: afterDeadline,
    });
    await expect(pickAuditsFor(db, grandma, week.id)).rejects.toBeInstanceOf(NotCommissioner);
  });

  test("a commissioner sets, moves, and clears a member's Lock and Tiebreaker Guess after the deadline, each audited", async () => {
    const { db, jonah, grandma, week, michigan, texas, florida, afterDeadline } = await setup();
    await savePick(db, grandma, week.id, michigan.id, michigan.homeTeamId, THURSDAY);
    await savePick(db, grandma, week.id, texas.id, texas.homeTeamId, THURSDAY);

    // A Lock still needs a pick to sit on, and a void game still cannot take one.
    await expect(overrideLock(db, jonah, grandma.id, week.id, florida.id, afterDeadline)).rejects.toThrow(/pick/i);
    await voidGame(db, jonah, florida.id, "Hurricane");
    await expect(overrideLock(db, jonah, grandma.id, week.id, florida.id, afterDeadline)).rejects.toThrow(/void/i);

    await overrideLock(db, jonah, grandma.id, week.id, michigan.id, afterDeadline);
    await overrideLock(db, jonah, grandma.id, week.id, texas.id, afterDeadline);
    expect((await pickSheet(db, grandma, week.id, afterDeadline)).lockGameId).toBe(texas.id);
    await overrideLock(db, jonah, grandma.id, week.id, null, afterDeadline);
    expect((await pickSheet(db, grandma, week.id, afterDeadline)).lockGameId).toBeNull();

    await expect(overrideTiebreakerGuess(db, jonah, grandma.id, week.id, 300, afterDeadline)).rejects.toThrow(
      /whole number/i,
    );
    await overrideTiebreakerGuess(db, jonah, grandma.id, week.id, 55, afterDeadline);
    expect((await pickSheet(db, grandma, week.id, afterDeadline)).tiebreakerGuess).toBe(55);
    await overrideTiebreakerGuess(db, jonah, grandma.id, week.id, null, afterDeadline);
    expect((await pickSheet(db, grandma, week.id, afterDeadline)).tiebreakerGuess).toBeNull();

    await expect(overrideLock(db, grandma, grandma.id, week.id, null, afterDeadline)).rejects.toBeInstanceOf(
      NotCommissioner,
    );
    await expect(overrideTiebreakerGuess(db, grandma, grandma.id, week.id, 1, afterDeadline)).rejects.toBeInstanceOf(
      NotCommissioner,
    );

    const log = await pickAuditsFor(db, jonah, week.id);
    expect(log.map((e) => [e.kind, e.previousValue, e.newValue])).toEqual([
      ["lock", null, "Michigan"],
      ["lock", "Michigan", "Texas"],
      ["lock", "Texas", null],
      ["tiebreaker_guess", null, "55"],
      ["tiebreaker_guess", "55", null],
    ]);
    expect(log.every((e) => e.memberId === grandma.id && e.changedBy === jonah.id)).toBe(true);
  });

  test("a commissioner reads and enters a member's picks before the deadline; a member cannot read another's", async () => {
    const { db, jonah, grandma, week, michigan, texas } = await setup();
    await savePick(db, grandma, week.id, michigan.id, michigan.homeTeamId, THURSDAY);

    await expect(memberSheet(db, grandma, jonah.id, week.id, THURSDAY)).rejects.toBeInstanceOf(NotCommissioner);
    await expect(memberSheet(db, jonah, 999999, week.id, THURSDAY)).rejects.toThrow(/no such member/i);

    await overridePick(db, jonah, grandma.id, week.id, texas.id, texas.awayTeamId, THURSDAY);
    const sheet = await memberSheet(db, jonah, grandma.id, week.id, THURSDAY);
    expect(sheet.member.displayName).toBe("Grandma");
    expect(sheet.sheet.picks.map((p) => [p.gameId, p.teamId])).toEqual([
      [michigan.id, michigan.homeTeamId],
      [texas.id, texas.awayTeamId],
    ]);
    expect(sheet.sheet.locked).toBe(false);
  });
});

describe("who hasn't picked", () => {
  test("lists every active member's progress, counts the ready ones, and drafts the reminder in Central time", async () => {
    const { db, jonah, grandma, week, michigan, texas, florida, deadline } = await setup();
    const em = await addMember(db, jonah, { displayName: "Cousin Em" });
    const gone = await addMember(db, jonah, { displayName: "Gone" });
    await setMemberActive(db, jonah, gone.id, false);

    // Jonah is done: every pick, a Lock, and a guess.
    for (const game of [michigan, texas, florida]) await savePick(db, jonah, week.id, game.id, game.homeTeamId, THURSDAY);
    await setLock(db, jonah, week.id, texas.id, THURSDAY);
    await setTiebreakerGuess(db, jonah, week.id, 70, THURSDAY);
    // Grandma has every pick but no Lock; Em has one pick and nothing else.
    for (const game of [michigan, texas, florida]) await savePick(db, grandma, week.id, game.id, game.awayTeamId, THURSDAY);
    await setTiebreakerGuess(db, grandma, week.id, 66, THURSDAY);
    await savePick(db, em, week.id, michigan.id, michigan.homeTeamId, THURSDAY);

    const report = await whoHasntPicked(db, jonah, week.id, THURSDAY);
    expect(report.deadline).toEqual(deadline);
    expect(report.needed).toBe(3);
    expect(report.ready).toBe(1);
    expect(report.members.map((m) => [m.member.displayName, m.picked, m.lockTeam, m.tiebreakerGuess, m.complete])).toEqual([
      ["Jonah", 3, "Texas", 70, true],
      ["Grandma", 3, null, 66, false],
      ["Cousin Em", 1, null, null, false],
    ]);

    // A void game is not a missing pick.
    await voidGame(db, jonah, florida.id, "Hurricane");
    const afterVoid = await whoHasntPicked(db, jonah, week.id, THURSDAY);
    expect(afterVoid.needed).toBe(2);
    expect(afterVoid.members.map((m) => m.picked)).toEqual([2, 2, 1]);

    // Thu 2026-09-11 00:00Z is 7:00 PM Central on Thursday the 10th.
    expect(reminderText(afterVoid)).toBe(
      "Saturday Slate Week 2 picks lock Thu, Sep 10 at 7:00 PM Central. Still need: Grandma (Lock of the Week), Cousin Em (1 pick, Lock of the Week, Tiebreaker Guess).",
    );

    await expect(whoHasntPicked(db, grandma, week.id, THURSDAY)).rejects.toBeInstanceOf(NotCommissioner);
  });

  test("the reminder says so when everyone is in", async () => {
    const { db, jonah, grandma, week, michigan, texas, florida } = await setup();
    for (const member of [jonah, grandma]) {
      for (const game of [michigan, texas, florida]) await savePick(db, member, week.id, game.id, game.homeTeamId, THURSDAY);
      await setLock(db, member, week.id, michigan.id, THURSDAY);
      await setTiebreakerGuess(db, member, week.id, 50, THURSDAY);
    }
    const report = await whoHasntPicked(db, jonah, week.id, THURSDAY);
    expect(report.ready).toBe(2);
    expect(reminderText(report)).toBe(
      "Saturday Slate Week 2 picks lock Thu, Sep 10 at 7:00 PM Central. Everyone is in.",
    );
  });
});
