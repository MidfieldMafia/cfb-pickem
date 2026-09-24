import { describe, expect, test, vi } from "vitest";
import { seasonResult } from "@/lib/results/results";
import { seasonStanding } from "@/lib/results/summary";
import { slateFor } from "@/lib/slate/slate";
import { familyGroup, feedWith, OKLAHOMA_AT_MICHIGAN, pickAs, publishWeek2, SUNDAY, THURSDAY } from "@/test/week-2";
import { currentWeek } from "./week";
import { ingestResults } from "@/lib/results/writes";

/**
 * How many times a request grades. Both counters wrap the real function, so
 * nothing about the grading changes: they only let a test see that the current
 * Week is not graded a second time on the way to the viewer's standing.
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
  test("is one pass, and the Week is a cut of the season rather than a second grading", async () => {
    const { db, week, slate, jonah, grandma, michigan } = await publishWeek2();
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    await pickAs(db, jonah, slate, michigan, michigan.awayTeamId, THURSDAY);
    await ingestResults(db, feedWith({ [OKLAHOMA_AT_MICHIGAN]: [24, 27] }), await slateFor(db, week.id), SUNDAY);
    const group = (await familyGroup(db)).id;

    passes.boards = passes.weeks = passes.seasons = 0;
    const live = await currentWeek(db, grandma, SUNDAY, { graded: true, season: true, group });
    if (live?.state !== "live") throw new Error(`expected a live Week, got ${live?.state}`);

    // `scoreSeason` grades each played Week inside itself, so a top-level
    // `scoreWeek` or a second board read is the current Week graded again.
    expect(passes).toEqual({ boards: 1, weeks: 0, seasons: 1 });

    const season = await seasonResult(db, group, SUNDAY);
    expect(live.result.scores).toEqual(season.weeks.find((w) => w.week.id === week.id)!.scores);
    expect(live.season).toEqual(seasonStanding(season.leaderboard, grandma.id));
  });

  test("the Week alone is still one pass, over that Week only", async () => {
    const { db, grandma } = await publishWeek2();
    const group = (await familyGroup(db)).id;

    passes.boards = passes.weeks = passes.seasons = 0;
    const week = await currentWeek(db, grandma, SUNDAY, { graded: true, group });

    if (week?.state !== "live") throw new Error(`expected a live Week, got ${week?.state}`);
    expect(week.season).toBeNull();
    expect(passes).toEqual({ boards: 1, weeks: 1, seasons: 0 });
  });
});
