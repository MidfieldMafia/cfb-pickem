/**
 * Starting a new Season (#251) through the server seam: which Season is active
 * afterwards, the Rules it carries over, and what a second run does.
 */
import { asc } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { seasons } from "@/db/schema";
import { seedWeek2 } from "@/test/week-2";
import { startSeason } from "./season";
import { activeSeason, InvalidSlate } from "./slate";

describe("startSeason", () => {
  test("makes the new year the one active Season, carrying the old one's Rules", async () => {
    const { db } = await seedWeek2();
    const before = await activeSeason(db);

    const started = await startSeason(db, 2027);

    expect(started).toEqual(expect.objectContaining({ year: 2027, active: true, rules: before.rules }));
    expect(await activeSeason(db)).toEqual(started);
    const all = await db.select({ year: seasons.year, active: seasons.active }).from(seasons).orderBy(asc(seasons.year));
    expect(all).toEqual([
      { year: 2026, active: false },
      { year: 2027, active: true },
    ]);
  });

  test("a second run changes nothing", async () => {
    const { db } = await seedWeek2();
    const first = await startSeason(db, 2027);

    expect(await startSeason(db, 2027)).toEqual(first);
    expect(await db.select().from(seasons)).toHaveLength(2);
  });

  test("refuses to go back to an earlier year", async () => {
    const { db } = await seedWeek2();
    await startSeason(db, 2027);

    await expect(startSeason(db, 2026)).rejects.toThrow(new InvalidSlate("The 2027 season has already started."));
    expect((await activeSeason(db)).year).toBe(2027);
  });

  test("refuses a year that is not a whole number", async () => {
    const { db } = await seedWeek2();

    await expect(startSeason(db, 2027.5)).rejects.toThrow(InvalidSlate);
    expect((await activeSeason(db)).year).toBe(2026);
  });
});
