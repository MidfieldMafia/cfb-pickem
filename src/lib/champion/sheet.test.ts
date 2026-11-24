/**
 * The Regular Season Champion's celebration sheet (#592): whether the
 * `(member)` layout opens it, and the seen row its dismissal writes, once per
 * member, group and season.
 */
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";
import { championSheetViews, weeks } from "@/db/schema";
import { deleteGroup } from "@/lib/groups/console";
import { removeMember, setMemberActive } from "@/lib/members/members";
import { clearOverride, ingestResults, overrideResult } from "@/lib/results/writes";
import { slateFor } from "@/lib/slate/slate";
import {
  addGroup,
  ALL_FINAL,
  familyGroup,
  feedWith,
  joinGroup,
  lockAs,
  pickAs,
  publishWeek2,
  SUNDAY,
  THURSDAY,
  TUESDAY,
} from "@/test/week-2";
import { championSheet, InvalidChampionSheet, seeChampionSheet, seenFromAction } from "./sheet";

const LATER = new Date(SUNDAY.getTime() + 60 * 60 * 1000);

/**
 * Week 2 as the season's last regular-season Week, every game final: Grandma
 * is champion on 30 points, Jonah second on 10 (`results.test.ts` has the sums).
 */
async function crowned({ settled = true } = {}) {
  const fixture = await publishWeek2();
  const { db, slate, jonah, grandma, week, miami, michigan, texas } = fixture;
  await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
  await pickAs(db, grandma, slate, texas, texas.awayTeamId, THURSDAY);
  await lockAs(db, grandma, slate, michigan.id, THURSDAY);
  await pickAs(db, jonah, slate, michigan, michigan.awayTeamId, THURSDAY);
  await pickAs(db, jonah, slate, texas, texas.homeTeamId, THURSDAY);
  await pickAs(db, jonah, slate, miami, miami.homeTeamId, THURSDAY);
  await db.update(weeks).set({ weekNumber: 13 }).where(eq(weeks.id, week.id));
  if (settled) await ingestResults(db, feedWith(ALL_FINAL), await slateFor(db, week.id), SUNDAY);
  const family = await familyGroup(db);
  return { ...fixture, family };
}

const names = (sheet: Awaited<ReturnType<typeof championSheet>>) =>
  sheet && { names: sheet.champions.map((m) => m.displayName), points: sheet.points, mine: sheet.viewerIsChampion };

describe("the sheet", () => {
  test("opens for the champion and every other member once Week 13 is settled", async () => {
    const { db, jonah, grandma, family } = await crowned();
    expect(names(await championSheet(db, grandma.id, family.id, SUNDAY))).toEqual({
      names: ["Grandma"],
      points: 30,
      mine: true,
    });
    expect(names(await championSheet(db, jonah.id, family.id, SUNDAY))).toEqual({
      names: ["Grandma"],
      points: 30,
      mine: false,
    });
    expect((await championSheet(db, jonah.id, family.id, SUNDAY))?.year).toBe(2026);
  });

  test("is nothing while a Week 13 game is still to play", async () => {
    const { db, grandma, family } = await crowned({ settled: false });
    expect(await championSheet(db, grandma.id, family.id, SUNDAY)).toBeNull();
  });

  test("is nothing again once the member has seen it, and still there for everyone else", async () => {
    const { db, jonah, grandma, family } = await crowned();
    await seeChampionSheet(db, grandma, family.id, SUNDAY);

    expect(await championSheet(db, grandma.id, family.id, LATER)).toBeNull();
    expect(await championSheet(db, jonah.id, family.id, LATER)).not.toBeNull();
  });

  test("is one group's: seeing it in another group leaves this one to show", async () => {
    const { db, jonah, family } = await crowned();
    const friends = await addGroup(db, "Friends");
    await joinGroup(db, friends, jonah, TUESDAY);
    await seeChampionSheet(db, jonah, friends.id, SUNDAY);
    expect(await championSheet(db, jonah.id, family.id, LATER)).not.toBeNull();
  });

  test("counts a failed read as seen, so a fault shows nothing", async () => {
    const { db, grandma, family } = await crowned();
    const broken = new Proxy(db, {
      get: (target, key) =>
        key === "select"
          ? () => {
              throw new Error("Neon is down");
            }
          : Reflect.get(target, key),
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await championSheet(broken, grandma.id, family.id, SUNDAY)).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("after a Result Override moves the title", () => {
  test("the previous champion's sheet never replays, and the new champion gets theirs", async () => {
    const { db, jonah, grandma, family, michigan } = await crowned();
    await seeChampionSheet(db, grandma, family.id, SUNDAY);
    await seeChampionSheet(db, jonah, family.id, SUNDAY);

    await overrideResult(db, jonah, michigan.id, { homeScore: 24, awayScore: 30, note: "Teams the wrong way round" }, LATER);

    expect(await championSheet(db, grandma.id, family.id, LATER)).toBeNull();
    expect(names(await championSheet(db, jonah.id, family.id, LATER))).toEqual({ names: ["Jonah"], points: 20, mine: true });

    await seeChampionSheet(db, jonah, family.id, LATER);
    expect(await championSheet(db, jonah.id, family.id, LATER)).toBeNull();
    // Cleared again, nobody's sheet replays: Grandma saw hers as champion.
    await clearOverride(db, jonah, michigan.id, LATER);
    expect(await championSheet(db, grandma.id, family.id, LATER)).toBeNull();
    expect(await championSheet(db, jonah.id, family.id, LATER)).toBeNull();
  });
});

describe("seeing it", () => {
  test("twice keeps one row, stamped the first time, and remembers it was seen as champion", async () => {
    const { db, grandma, family, season } = await crownedWithSeason();
    await seeChampionSheet(db, grandma, family.id, SUNDAY);
    await seeChampionSheet(db, grandma, family.id, LATER);
    expect(await db.select().from(championSheetViews)).toEqual([
      { memberId: grandma.id, groupId: family.id, seasonId: season, asChampion: true, seenAt: SUNDAY },
    ]);
  });

  test("before there is a champion writes nothing", async () => {
    const { db, grandma, family } = await crowned({ settled: false });
    await seeChampionSheet(db, grandma, family.id, SUNDAY);
    expect(await db.select().from(championSheetViews)).toEqual([]);
  });

  test("from the action records the signed-in member, in a group of theirs only", async () => {
    const { db, grandma, family } = await crowned();
    const route = { db, requireMember: async () => grandma, now: () => SUNDAY };
    const friends = await addGroup(db, "Friends");
    await expect(seenFromAction(route, friends.id)).rejects.toBeInstanceOf(InvalidChampionSheet);
    await expect(seenFromAction(route, "1")).rejects.toBeInstanceOf(InvalidChampionSheet);
    expect(await db.select().from(championSheetViews)).toEqual([]);

    await seenFromAction(route, family.id);
    expect(await championSheet(db, grandma.id, family.id, LATER)).toBeNull();
  });
});

test("deleting a member takes their seen rows", async () => {
  const { db, jonah, grandma, family } = await crowned();
  await seeChampionSheet(db, grandma, family.id, SUNDAY);
  await seeChampionSheet(db, jonah, family.id, SUNDAY);
  await setMemberActive(db, jonah, grandma.id, false);
  await removeMember(db, jonah, grandma.id);
  expect((await db.select().from(championSheetViews)).map((r) => r.memberId)).toEqual([jonah.id]);
});

test("deleting a group takes its seen rows", async () => {
  const { db, jonah, family } = await crowned();
  const friends = await addGroup(db, "Friends");
  await joinGroup(db, friends, jonah, TUESDAY);
  await seeChampionSheet(db, jonah, friends.id, SUNDAY);
  await seeChampionSheet(db, jonah, family.id, SUNDAY);
  await deleteGroup(db, jonah, friends.id, "Friends");
  expect((await db.select().from(championSheetViews)).map((r) => r.groupId)).toEqual([family.id]);
});

async function crownedWithSeason() {
  const fixture = await crowned();
  return { ...fixture, season: fixture.week.seasonId };
}
