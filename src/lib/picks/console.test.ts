/**
 * The commissioner's side of pick entry that is not the writer: reading
 * another member's sheet early, and the who-hasn't-picked view that drives the
 * reminder. What a commissioner's *edit* does now lives in `edits.test.ts`,
 * over the one writer, where "a member cannot" is a row in a table over
 * `Authority` rather than a second copy of every rule.
 */
import { describe, expect, test } from "vitest";
import { asCommissioner } from "@/lib/members/authority";
import { NotCommissioner, setMemberActive } from "@/lib/members/members";
import { voidGame } from "@/lib/slate/slate";
import { guessAs, joinAt, lockAs, pickAs, publishWeek2, THURSDAY, TUESDAY } from "@/test/week-2";
import { memberSheet, pickAuditsFor, reminderText, whoHasntPicked } from "./console";
import { applyEdit } from "./edits";

/** The shared published Week 2, plus the moment just after its Deadline. */
async function setup() {
  const fixture = await publishWeek2();
  return { ...fixture, afterDeadline: new Date(fixture.deadline.getTime() + 3600_000) };
}

describe("reading a member's sheet from the console", () => {
  test("a commissioner reads and enters a member's picks before the deadline; a member cannot read another's", async () => {
    const { db, slate, jonah, grandma, week, michigan, texas } = await setup();
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);

    await expect(memberSheet(db, grandma, jonah.id, week.id, THURSDAY)).rejects.toBeInstanceOf(NotCommissioner);
    await expect(memberSheet(db, jonah, 999999, week.id, THURSDAY)).rejects.toThrow(/no such member/i);

    await applyEdit(
      db,
      asCommissioner(jonah, grandma.id),
      slate,
      { kind: "pick", gameId: texas.id, teamId: texas.awayTeamId },
      THURSDAY,
    );

    const sheet = await memberSheet(db, jonah, grandma.id, week.id, THURSDAY);
    expect(sheet.member.displayName).toBe("Grandma");
    expect(sheet.sheet.picks.map((p) => [p.gameId, p.teamId])).toEqual([
      [michigan.id, michigan.homeTeamId],
      [texas.id, texas.awayTeamId],
    ]);
    expect(sheet.sheet.locked).toBe(false);
  });

  test("the change log is a commissioner's to read, and names both members", async () => {
    const { db, slate, jonah, grandma, week, michigan, afterDeadline } = await setup();
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    await applyEdit(
      db,
      asCommissioner(jonah, grandma.id),
      slate,
      { kind: "pick", gameId: michigan.id, teamId: michigan.awayTeamId },
      afterDeadline,
    );

    const log = await pickAuditsFor(db, jonah, week.id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      memberName: "Grandma",
      changedByName: "Jonah",
      previousValue: "Michigan",
      newValue: "Oklahoma",
      changedAt: afterDeadline,
    });

    await expect(pickAuditsFor(db, grandma, week.id)).rejects.toBeInstanceOf(NotCommissioner);
  });
});

describe("who hasn't picked", () => {
  test("lists every active member's progress, counts the ready ones, and drafts the reminder in Central time", async () => {
    const { db, slate, jonah, grandma, week, michigan, texas, miami, deadline } = await setup();
    const em = await joinAt(db, jonah, "Cousin Em", TUESDAY);
    const gone = await joinAt(db, jonah, "Gone", TUESDAY);
    await setMemberActive(db, jonah, gone.id, false);

    // Jonah is done: every pick, a Lock, and a guess.
    for (const game of [michigan, texas, miami]) await pickAs(db, jonah, slate, game, game.homeTeamId, THURSDAY);
    await lockAs(db, jonah, slate, texas.id, THURSDAY);
    await guessAs(db, jonah, slate, 70, THURSDAY);
    // Grandma has every pick but no Lock; Em has one pick and nothing else.
    for (const game of [michigan, texas, miami]) await pickAs(db, grandma, slate, game, game.awayTeamId, THURSDAY);
    await guessAs(db, grandma, slate, 66, THURSDAY);
    await pickAs(db, em, slate, michigan, michigan.homeTeamId, THURSDAY);

    const report = await whoHasntPicked(db, jonah, week.id, THURSDAY);
    expect(report.deadline).toEqual(deadline);
    expect(report.needed).toBe(3);
    expect(report.ready).toBe(1);
    expect(report.members.map((m) => [m.member.displayName, m.picked, m.lockTeam, m.tiebreakerGuess, m.complete])).toEqual([
      ["Jonah", 3, "Texas", 70, true],
      ["Grandma", 3, null, 66, false],
      ["Cousin Em", 1, null, null, false],
    ]);

    // A void game is not a missing pick, and a Lock sitting on it is a Dropped Lock: something to move, so not done.
    await lockAs(db, jonah, slate, miami.id, THURSDAY);
    await voidGame(db, jonah, miami.id, "Hurricane");
    const afterVoid = await whoHasntPicked(db, jonah, week.id, THURSDAY);
    expect(afterVoid.needed).toBe(2);
    expect(afterVoid.ready).toBe(0);
    expect(afterVoid.members.map((m) => [m.picked, m.lockTeam, m.lockDropped, m.complete])).toEqual([
      [2, null, true, false],
      [2, null, false, false],
      [1, null, false, false],
    ]);

    // Thu 2026-09-11 00:00Z is 7:00 PM Central on Thursday the 10th.
    expect(reminderText(afterVoid)).toBe(
      "Saturday Slate Week 2 picks lock Thu, Sep 10 at 7:00 PM Central. Still need: Jonah (Lock of the Week), Grandma (Lock of the Week), Cousin Em (1 pick, Lock of the Week, Tiebreaker Guess).",
    );

    await expect(whoHasntPicked(db, grandma, week.id, THURSDAY)).rejects.toBeInstanceOf(NotCommissioner);
  });

  test("a member who joins after the Deadline is not chased, and neither is one who picked and left", async () => {
    const { db, slate, jonah, grandma, week, michigan, deadline } = await setup();
    const late = await joinAt(db, jonah, "Late", new Date(deadline.getTime() + 3600_000));
    // The Reveal keeps this one, because their points happened; the reminder
    // does not, because there is nobody left to remind.
    const gone = await joinAt(db, jonah, "Gone", TUESDAY);
    await pickAs(db, gone, slate, michigan, michigan.homeTeamId, THURSDAY);
    await setMemberActive(db, jonah, gone.id, false);

    const report = await whoHasntPicked(db, jonah, week.id, THURSDAY);

    expect(report.members.map((m) => m.member.displayName)).toEqual(["Jonah", "Grandma"]);
    expect(report.members.map((m) => m.member.id)).not.toContain(late.id);
    expect(reminderText(report)).not.toMatch(/Late|Gone/);
    // Grandma is on both, so the two answers agree about everyone they share.
    expect(report.members.map((m) => m.member.id)).toContain(grandma.id);
  });

  test("the reminder says so when everyone is in", async () => {
    const { db, slate, jonah, grandma, week, michigan, texas, miami } = await setup();
    for (const member of [jonah, grandma]) {
      for (const game of [michigan, texas, miami]) await pickAs(db, member, slate, game, game.homeTeamId, THURSDAY);
      await lockAs(db, member, slate, michigan.id, THURSDAY);
      await guessAs(db, member, slate, 50, THURSDAY);
    }
    const report = await whoHasntPicked(db, jonah, week.id, THURSDAY);
    expect(report.ready).toBe(2);
    expect(reminderText(report)).toBe(
      "Saturday Slate Week 2 picks lock Thu, Sep 10 at 7:00 PM Central. Everyone is in.",
    );
  });
});
