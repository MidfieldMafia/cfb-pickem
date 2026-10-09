/**
 * Which Tours a member has dismissed (#429): the read the `(member)` layout
 * asks, the write the Tour runner's Done, Skip and Escape make, and the
 * migration that keeps the Welcome Tour from members who were already playing.
 */
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { dataDir } from "@electric-sql/pglite-prepopulatedfs";
import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, test, vi } from "vitest";
import * as schema from "@/db/schema";
import { members, tourDismissals } from "@/db/schema";
import type { Db } from "@/db/types";
import { removeMember, setMemberActive } from "@/lib/members/members";
import { seedWeek2, THURSDAY } from "@/test/week-2";
import { dismissFor, dismissTour, InvalidTour, tourDismissed } from "./dismissals";

const LATER = new Date(THURSDAY.getTime() + 60 * 60 * 1000);

async function rows(db: Db) {
  return db.select().from(tourDismissals).orderBy(asc(tourDismissals.memberId));
}

describe("the read", () => {
  test("is false for a new member and true once they dismiss", async () => {
    const { db, grandma } = await seedWeek2();
    expect(await tourDismissed(db, grandma.id, "welcome")).toBe(false);

    await dismissTour(db, grandma.id, "welcome", THURSDAY);

    expect(await tourDismissed(db, grandma.id, "welcome")).toBe(true);
  });

  test("is one member's: someone else dismissing leaves it false", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    await dismissTour(db, jonah.id, "welcome", THURSDAY);
    expect(await tourDismissed(db, grandma.id, "welcome")).toBe(false);
  });

  test("counts a failed read as dismissed, so a fault shows no Tour", async () => {
    const broken = {
      select: () => {
        throw new Error("Neon is down");
      },
    } as unknown as Db;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await tourDismissed(broken, 1, "welcome")).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe("dismissing", () => {
  test("twice is a no-op: one row, stamped the first time", async () => {
    const { db, grandma } = await seedWeek2();
    await dismissTour(db, grandma.id, "welcome", THURSDAY);
    await dismissTour(db, grandma.id, "welcome", LATER);

    expect(await rows(db)).toEqual([{ memberId: grandma.id, tourId: "welcome", dismissedAt: THURSDAY }]);
  });

  test("from the action records the signed-in member, never one named by the caller", async () => {
    const { db, grandma } = await seedWeek2();
    await dismissFor({ db, requireMember: async () => grandma, now: () => THURSDAY }, "welcome");
    expect(await rows(db)).toEqual([{ memberId: grandma.id, tourId: "welcome", dismissedAt: THURSDAY }]);
  });

  test("from the action refuses a Tour id the app does not have", async () => {
    const { db, grandma } = await seedWeek2();
    const route = { db, requireMember: async () => grandma };
    await expect(dismissFor(route, "whats-new")).rejects.toBeInstanceOf(InvalidTour);
    await expect(dismissFor(route, 7)).rejects.toBeInstanceOf(InvalidTour);
    expect(await rows(db)).toEqual([]);
  });
});

test("deleting a member takes their dismissals and leaves everyone else's", async () => {
  const { db, jonah, grandma } = await seedWeek2();
  await dismissTour(db, jonah.id, "welcome", THURSDAY);
  await dismissTour(db, grandma.id, "welcome", THURSDAY);

  await setMemberActive(db, jonah, grandma.id, false);
  await removeMember(db, jonah, grandma.id);

  expect(await rows(db)).toEqual([expect.objectContaining({ memberId: jonah.id })]);
});

describe("the migration", () => {
  /**
   * The committed migrations up to and including `tag`, as a folder of their
   * own: Drizzle applies whatever the journal lists past the last one it ran,
   * so migrating to this and then to the real folder runs the later ones over
   * whatever the test put in between.
   */
  function migrationsThrough(tag: string): string {
    const folder = mkdtempSync(join(tmpdir(), "drizzle-"));
    cpSync("drizzle", folder, { recursive: true });
    const journalPath = join(folder, "meta", "_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    const last = journal.entries.findIndex((entry: { tag: string }) => entry.tag === tag);
    journal.entries = journal.entries.slice(0, last + 1);
    writeFileSync(journalPath, JSON.stringify(journal));
    return folder;
  }

  test("backfills a welcome dismissal for exactly the members already welcomed", async () => {
    const client = await PGlite.create({ loadDataDir: await dataDir() });
    const db = drizzle({ client, schema });
    await migrate(db, { migrationsFolder: migrationsThrough("0014_game-stats") });
    const [welcomed, partWay, alsoWelcomed] = await db
      .insert(members)
      .values([
        { displayName: "Welcomed", token: "a", welcomedAt: THURSDAY },
        { displayName: "Part way through setup", token: "b" },
        { displayName: "Also welcomed", token: "c", welcomedAt: LATER },
      ])
      .returning();

    await migrate(db, { migrationsFolder: "drizzle" });

    const backfilled = await db.select().from(tourDismissals).orderBy(asc(tourDismissals.memberId));
    expect(backfilled.map(({ memberId, tourId }) => ({ memberId, tourId }))).toEqual([
      { memberId: welcomed.id, tourId: "welcome" },
      { memberId: alsoWelcomed.id, tourId: "welcome" },
    ]);
    expect(await tourDismissed(db, partWay.id, "welcome")).toBe(false);
    await client.close();
  });
});
