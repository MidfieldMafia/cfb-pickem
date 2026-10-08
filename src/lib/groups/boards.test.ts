/**
 * A board belongs to one group. The Leaderboard, the week's scores and the
 * Reveal all read the group's own roster, so two groups playing the same Slate
 * stand on their own members alone — and a person in both is scored twice, once
 * against each group's join date.
 *
 * Everything here runs against the published Week 2 fixture and a real
 * in-process database, because "who is on this board" is a question about rows,
 * not about the engine: `@/lib/scoring`'s own suites hold the rules themselves.
 */
import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { membershipRemovals } from "@/db/schema";
import { groupPlayedWeeks, seasonResult } from "@/lib/results/results";
import { slateFor } from "@/lib/slate/slate";
import {
  addGroup,
  ALL_FINAL,
  familyGroup,
  feedWith,
  joinAt,
  joinGroup,
  lockAs,
  pickAs,
  publishWeek2,
  SUNDAY,
  THURSDAY,
  TUESDAY,
} from "@/test/week-2";
import { ingestResults } from "@/lib/results/writes";

/** The Monday after Week 2, for a restore that lands once the week is settled. */
const MONDAY = new Date("2026-09-14T12:00:00Z");

/**
 * Week 2 played out: Grandma takes Michigan (Locked) and Ohio State for 30,
 * Jonah takes Miami alone for 10. The same two members and the same Picks the
 * `results.ts` suite uses, so the numbers here are already hand-verified there.
 */
async function playedWeek2() {
  const fixture = await publishWeek2();
  const { db, slate, jonah, grandma, miami, michigan, texas, week } = fixture;

  await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
  await pickAs(db, grandma, slate, texas, texas.awayTeamId, THURSDAY);
  await lockAs(db, grandma, slate, michigan.id, THURSDAY);
  await pickAs(db, jonah, slate, michigan, michigan.awayTeamId, THURSDAY);
  await pickAs(db, jonah, slate, texas, texas.homeTeamId, THURSDAY);
  await pickAs(db, jonah, slate, miami, miami.homeTeamId, THURSDAY);

  await ingestResults(db, feedWith(ALL_FINAL), await slateFor(db, week.id), SUNDAY);
  return fixture;
}

describe("a board is one group's", () => {
  test("two groups sharing a member stand on their own members alone", async () => {
    const { db, grandma } = await playedWeek2();
    const family = await familyGroup(db);
    // Grandma plays in both. Jonah is in Mabry Family only, so Friends is a
    // board of one even though the two groups play the very same Slate.
    const friends = await addGroup(db, "Friends");
    await joinGroup(db, friends, grandma, TUESDAY);

    const inFamily = await seasonResult(db, family.id, SUNDAY);
    const inFriends = await seasonResult(db, friends.id, SUNDAY);

    expect(inFamily.leaderboard.map((r) => [r.member.displayName, r.rank, r.totalPoints])).toEqual([
      ["Grandma", 1, 30],
      ["Jonah", 2, 10],
    ]);
    // The same person, the same Picks, a board of her own.
    expect(inFriends.leaderboard.map((r) => [r.member.displayName, r.rank, r.totalPoints])).toEqual([
      ["Grandma", 1, 30],
    ]);

    // The Weekly Win is decided within the group, so it is hers in both — but
    // in Friends there was nobody to beat, which is the point of scoping it.
    expect(inFamily.weeks[0].weeklyWin!.winners.map((m) => m.displayName)).toEqual(["Grandma"]);
    expect(inFriends.weeks[0].weeklyWin!.winners.map((m) => m.displayName)).toEqual(["Grandma"]);
  });

  test("joining a second group after a Deadline earns no head start there", async () => {
    const { db, grandma } = await playedWeek2();
    const friends = await addGroup(db, "Friends");
    // Joined on the Sunday, long after Week 2's Friday Deadline.
    await joinGroup(db, friends, grandma, SUNDAY);

    const inFriends = await seasonResult(db, friends.id, SUNDAY);

    // The 30 points she scored in Mabry Family stay there. In Friends she has
    // played nothing, so her row is dashes rather than a lead she never earned.
    expect(inFriends.leaderboard.find((r) => r.member.id === grandma.id)).toMatchObject({
      totalPoints: 0,
      weeksPlayed: 0,
      weeklyWins: 0,
      averagePoints: null,
    });
    // Nobody was in Friends at the Deadline, so nobody there played Week 2 and
    // it is not a Week of Friends' season at all (#332).
    expect(inFriends.weeks).toEqual([]);
  });

  test("a Week with Picks in one group and none in the other is played only where someone picked (#332)", async () => {
    const { db, jonah, week } = await playedWeek2();
    const family = await familyGroup(db);
    // Cousins joined before the Deadline and picked nothing: on the board, sat out.
    const cousins = await addGroup(db, "Cousins");
    const cousin = await joinAt(db, jonah, "Cousin", TUESDAY);
    await joinGroup(db, cousins, cousin, TUESDAY);

    const inFamily = await seasonResult(db, family.id, SUNDAY);
    const inCousins = await seasonResult(db, cousins.id, SUNDAY);

    expect(inFamily.weeks.map((w) => w.week.weekNumber)).toEqual([2]);
    // No strip tile, and `selectedWeek` falls back as for any unplayed Week.
    expect(inCousins.weeks).toEqual([]);
    // The Week counted for nobody, so the season row is the same either way.
    expect(inCousins.leaderboard.find((r) => r.member.id === cousin.id)).toMatchObject({
      totalPoints: 0,
      weeksPlayed: 0,
      previousRank: null,
    });

    // The Reveal offers the same Weeks: Week 2 in Family, nothing in Cousins.
    const season = inFamily.season;
    expect((await groupPlayedWeeks(db, family.id, season, SUNDAY)).map((w) => w.id)).toEqual([week.id]);
    expect(await groupPlayedWeeks(db, cousins.id, season, SUNDAY)).toEqual([]);
  });

  test("a removed member is absent from the group's past weeks, and the Weekly Win moves", async () => {
    const { db, grandma } = await playedWeek2();
    const family = await familyGroup(db);

    // Removed after the week was played and not brought back. The spec is
    // explicit that this hides her from every screen of the group, past weeks
    // included — so the week she won is now Jonah's.
    await db
      .insert(membershipRemovals)
      .values({ groupId: family.id, memberId: grandma.id, removedAt: SUNDAY });

    const after = await seasonResult(db, family.id, SUNDAY);

    expect(after.leaderboard.map((r) => r.member.displayName)).toEqual(["Jonah"]);
    expect(after.weeks[0].scores.map((s) => s.member.displayName)).toEqual(["Jonah"]);
    expect(after.weeks[0].weeklyWin!.winners.map((m) => m.displayName)).toEqual(["Jonah"]);
  });

  test("restoring a removed member brings their Weekly Win back", async () => {
    const { db, grandma } = await playedWeek2();
    const family = await familyGroup(db);
    const before = await seasonResult(db, family.id, SUNDAY);

    const [removal] = await db
      .insert(membershipRemovals)
      .values({ groupId: family.id, memberId: grandma.id, removedAt: SUNDAY })
      .returning();

    // Asserted in the middle, so this test can actually fail: without it a
    // removal that did nothing would leave the board unchanged and the restore
    // would "pass" by never having had anything to put back.
    const during = await seasonResult(db, family.id, SUNDAY);
    expect(during.leaderboard.map((r) => r.member.displayName)).toEqual(["Jonah"]);
    expect(during.weeks[0].weeklyWin!.winners.map((m) => m.displayName)).toEqual(["Jonah"]);

    // Nothing was deleted, so putting the membership back restores the lot.
    await db.update(membershipRemovals).set({ restoredAt: MONDAY }).where(eq(membershipRemovals.id, removal.id));

    const restored = await seasonResult(db, family.id, SUNDAY);

    expect(restored.leaderboard.map((r) => [r.member.displayName, r.totalPoints, r.weeklyWins])).toEqual(
      before.leaderboard.map((r) => [r.member.displayName, r.totalPoints, r.weeklyWins]),
    );
    expect(restored.weeks[0].weeklyWin!.winners.map((m) => m.displayName)).toEqual(["Grandma"]);
  });
});
