/**
 * Which Week a console page is on. Every console page asks `consoleWeek`, so
 * these are the two Week rules in one place: a Week is created on first visit,
 * and the chooser includes the Week just opened.
 */
import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { weeks } from "@/db/schema";
import { publishWeek2, seedWeek2, WEEK_2 } from "@/test/week-2";
import { consoleWeek } from "./slate";

describe("consoleWeek", () => {
  test("opens the requested Week, creating it on first visit, and the chooser lists it at once", async () => {
    const { db, jonah } = await publishWeek2();

    const fresh = await consoleWeek(db, jonah, "5");

    expect(fresh.week).toMatchObject({ weekNumber: 5, published: false });
    expect(fresh.slate.week.id).toBe(fresh.week.id);
    expect(fresh.slate.games).toEqual([]);
    expect(fresh.weeks.map((w) => w.weekNumber)).toEqual([2, 5]);
    expect(await db.query.weeks.findMany({ where: eq(weeks.seasonId, fresh.season.id) })).toHaveLength(2);

    // A second visit finds the row rather than making another.
    const again = await consoleWeek(db, jonah, "5");
    expect(again.week.id).toBe(fresh.week.id);
    expect(again.weeks.map((w) => w.weekNumber)).toEqual([2, 5]);
  });

  test("a missing or junk param lands on the latest published Week", async () => {
    const { db, jonah, week } = await publishWeek2();
    await consoleWeek(db, jonah, "9");

    for (const param of [undefined, "", "abc", "0", "16", "2.5"]) {
      expect((await consoleWeek(db, jonah, param)).week.id).toBe(week.id);
    }
    // The Slate it hands back is the published one, games and all.
    expect((await consoleWeek(db, jonah, undefined)).slate.games).toHaveLength(3);
  });

  test("with nothing published it lands on the latest Week that exists, and with no Weeks on Week 1", async () => {
    const { db, jonah } = await seedWeek2();

    expect((await consoleWeek(db, jonah, undefined)).week.weekNumber).toBe(1);
    await consoleWeek(db, jonah, WEEK_2.week);
    await consoleWeek(db, jonah, 4);
    expect((await consoleWeek(db, jonah, undefined)).week.weekNumber).toBe(4);
  });

  test("a numeric request is taken as is", async () => {
    const { db, jonah } = await seedWeek2();
    expect((await consoleWeek(db, jonah, 3)).week.weekNumber).toBe(3);
  });
});
