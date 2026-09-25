import { describe, expect, test, vi } from "vitest";
import { familyGroup, publishWeek2, SUNDAY } from "@/test/week-2";
import { currentWeek } from "./week";

/**
 * How many times a request grades. The counters wrap the real functions, so
 * nothing about the grading changes: they only let a test see what a Live
 * Board poll pays for.
 */
const passes = vi.hoisted(() => ({ boards: 0, weeks: 0, seasons: 0 }));

vi.mock("@/lib/groups/memberships", async (original) => {
  const real = await original<typeof import("@/lib/groups/memberships")>();
  return {
    ...real,
    groupBoard: (...args: Parameters<typeof real.groupBoard>) => {
      passes.boards += 1;
      return real.groupBoard(...args);
    },
  };
});

vi.mock("@/lib/scoring", async (original) => {
  const real = await original<typeof import("@/lib/scoring")>();
  return {
    ...real,
    scoreWeek: (...args: Parameters<typeof real.scoreWeek>) => {
      passes.weeks += 1;
      return real.scoreWeek(...args);
    },
    scoreSeason: (...args: Parameters<typeof real.scoreSeason>) => {
      passes.seasons += 1;
      return real.scoreSeason(...args);
    },
  };
});

describe("grading the current week for the Live Board", () => {
  // Every thirty-second poll runs this, so a season pass here would grade
  // every played Week to render a screen that shows one.
  test("is one pass over that Week only, never the season", async () => {
    const { db, grandma } = await publishWeek2();
    const group = (await familyGroup(db)).id;

    passes.boards = passes.weeks = passes.seasons = 0;
    const week = await currentWeek(db, grandma, SUNDAY, { graded: true, group });

    if (week?.state !== "live") throw new Error(`expected a live Week, got ${week?.state}`);
    expect(passes).toEqual({ boards: 1, weeks: 1, seasons: 0 });
  });
});
