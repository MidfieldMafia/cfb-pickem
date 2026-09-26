import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { gameStats, games, seasonRosters, weeks } from "@/db/schema";
import { recordings } from "@/lib/cfbd/recorded";
import type { CfbdGamePlayerStats, CfbdGameTeamStats, CfbdRosterPlayer } from "@/lib/cfbd/types";
import { slateFor } from "@/lib/slate/slate";
import { freshSlate } from "@/lib/week/week";
import {
  FAMU_AT_MIAMI,
  feedWith,
  OHIO_STATE_AT_TEXAS,
  OKLAHOMA_AT_MICHIGAN,
  publishWeek2,
  SATURDAY_EVENING,
  SUNDAY,
  type Finals,
} from "@/test/week-2";
import { finalStats, refreshStatsIfStale, STATS_RETRY_MS, STATS_WAIT_MS } from "./box-scores";
import { effectiveResult } from "./result";
import { ingestResults, voidGame } from "./writes";

const recorded = recordings["2026-week-2"];
const minutes = (at: Date, n: number) => new Date(at.getTime() + n * 60_000);

/** What the two box-score endpoints and the roster answer: the recording, `[]`, or an error to throw. */
interface StatsAnswers {
  teams?: CfbdGameTeamStats[] | Error;
  players?: CfbdGamePlayerStats[] | Error;
  roster?: CfbdRosterPlayer[] | Error;
}

/**
 * The Week 2 feed with `finals` final, and box scores that answer as told,
 * counting each call: the stats gate is judged on how often it spends them.
 */
function statsFeed(finals: Finals, answers: StatsAnswers = {}) {
  const reads = { teams: 0, players: 0, roster: 0 };
  const answer = async <T,>(value: T | Error): Promise<T> => {
    if (value instanceof Error) throw value;
    return value;
  };
  const feed = {
    ...feedWith(finals),
    gameTeamStats: async () => {
      reads.teams += 1;
      return answer(answers.teams ?? recorded.gameTeamStats);
    },
    gamePlayerStats: async () => {
      reads.players += 1;
      return answer(answers.players ?? recorded.gamePlayerStats);
    },
    roster: async () => {
      reads.roster += 1;
      return answer(answers.roster ?? recorded.roster);
    },
  };
  return { feed, reads };
}

async function setup() {
  const fixture = await publishWeek2();
  const { db, week } = fixture;
  return {
    ...fixture,
    /** Puts the scores in, the way the results gate would. */
    finish: async (finals: Finals, at: Date) => ingestResults(db, feedWith(finals), await slateFor(db, week.id), at),
    /** The stats gate against a freshly read Slate, as each request reads it. */
    refresh: async (feed: ReturnType<typeof statsFeed>["feed"], at: Date) =>
      refreshStatsIfStale(db, feed, await slateFor(db, week.id), at),
    stored: async () => (await db.select().from(gameStats)).map((row) => row.gameId).sort(),
    reload: async (gameId: number) => (await db.query.games.findFirst({ where: eq(games.id, gameId) }))!,
  };
}

const MICHIGAN_FINAL: Finals = { [OKLAHOMA_AT_MICHIGAN]: [24, 13] };
const TWO_FINALS: Finals = { ...MICHIGAN_FINAL, [FAMU_AT_MIAMI]: [7, 45] };

describe("the stats gate", () => {
  test("asks for nothing until a slate game is final", async () => {
    const { refresh } = await setup();
    const { feed, reads } = statsFeed({});

    expect(await refresh(feed, SATURDAY_EVENING)).toBe("idle");
    expect(reads).toEqual({ teams: 0, players: 0, roster: 0 });
  });

  test("an empty answer is normal: nothing is stored, and it asks again after five minutes and not before", async () => {
    const { finish, refresh, stored } = await setup();
    await finish(MICHIGAN_FINAL, SATURDAY_EVENING);
    const { feed, reads } = statsFeed(MICHIGAN_FINAL, { teams: [], players: [] });

    expect(await refresh(feed, SATURDAY_EVENING)).toBe("refreshed");
    expect(reads).toEqual({ teams: 1, players: 1, roster: 0 });
    expect(await stored()).toEqual([]);

    // Four minutes on, the claim still holds.
    expect(await refresh(feed, minutes(SATURDAY_EVENING, 4))).toBe("fresh");
    expect(reads.teams).toBe(1);

    expect(await refresh(feed, minutes(SATURDAY_EVENING, STATS_RETRY_MS / 60_000))).toBe("refreshed");
    expect(reads.teams).toBe(2);
  });

  test("once published, every final game in the answer is stored in one pass, and the season's roster is read once", async () => {
    const { db, season, finish, refresh, stored, michigan, miami, texas } = await setup().then(async (s) => ({
      ...s,
      season: (await slateFor(s.db, s.week.id)).season,
    }));
    await finish(TWO_FINALS, SATURDAY_EVENING);
    const { feed, reads } = statsFeed(TWO_FINALS);

    expect(await refresh(feed, SATURDAY_EVENING)).toBe("refreshed");

    // Texas is in the week's answer too, but not final here: its box score waits for its final.
    expect(await stored()).toEqual([miami.id, michigan.id].sort());
    expect(reads).toEqual({ teams: 1, players: 1, roster: 1 });
    const roster = await db.query.seasonRosters.findFirst({ where: eq(seasonRosters.seasonId, season.id) });
    // The two players with a null position are not kept.
    expect(Object.keys(roster!.positions)).toHaveLength(recorded.roster.length - 2);

    // Texas goes final: the next claim fetches the week again, and reads the positions from Neon.
    const all: Finals = { ...TWO_FINALS, [OHIO_STATE_AT_TEXAS]: [27, 20] };
    await finish(all, minutes(SATURDAY_EVENING, 10));
    const later = statsFeed(all);
    expect(await refresh(later.feed, minutes(SATURDAY_EVENING, 10))).toBe("refreshed");
    expect(later.reads).toEqual({ teams: 1, players: 1, roster: 0 });
    expect(await stored()).toEqual([miami.id, michigan.id, texas.id].sort());
  });

  test("two requests holding the same Slate race for one claim, and only one of them calls", async () => {
    const { db, week, finish } = await setup();
    await finish(MICHIGAN_FINAL, SATURDAY_EVENING);
    const { feed, reads } = statsFeed(MICHIGAN_FINAL, { teams: [], players: [] });
    // Both read the Week before either claimed it, so neither can skip the claim on what it holds.
    const slate = await slateFor(db, week.id);

    const outcomes = await Promise.all([
      refreshStatsIfStale(db, feed, slate, SATURDAY_EVENING),
      refreshStatsIfStale(db, feed, slate, SATURDAY_EVENING),
    ]);

    expect(outcomes.sort()).toEqual(["fresh", "refreshed"]);
    expect(reads.teams).toBe(1);
  });

  test("a stored box score is never fetched again", async () => {
    const { finish, refresh } = await setup();
    await finish(MICHIGAN_FINAL, SATURDAY_EVENING);
    await refresh(statsFeed(MICHIGAN_FINAL).feed, SATURDAY_EVENING);
    const { feed, reads } = statsFeed(MICHIGAN_FINAL);

    expect(await refresh(feed, minutes(SATURDAY_EVENING, 10))).toBe("idle");
    expect(await refresh(feed, minutes(SATURDAY_EVENING, 20))).toBe("idle");
    expect(reads).toEqual({ teams: 0, players: 0, roster: 0 });
  });

  test("a game only half published (team stats but no player stats) waits for the other half", async () => {
    const { finish, refresh, stored } = await setup();
    await finish(MICHIGAN_FINAL, SATURDAY_EVENING);

    await refresh(statsFeed(MICHIGAN_FINAL, { players: [] }).feed, SATURDAY_EVENING);

    expect(await stored()).toEqual([]);
  });

  test("a roster call that fails stores nothing, and the next claim tries again", async () => {
    const { finish, refresh, stored, michigan } = await setup();
    await finish(MICHIGAN_FINAL, SATURDAY_EVENING);

    await expect(
      refresh(statsFeed(MICHIGAN_FINAL, { roster: new Error("timeout") }).feed, SATURDAY_EVENING),
    ).rejects.toThrow("timeout");
    expect(await stored()).toEqual([]);

    await refresh(statsFeed(MICHIGAN_FINAL).feed, minutes(SATURDAY_EVENING, 5));
    expect(await stored()).toEqual([michigan.id]);
  });

  test("a void game, and a game three days past its kickoff, are not waited on", async () => {
    const { db, jonah, finish, refresh, michigan } = await setup();
    await finish(MICHIGAN_FINAL, SATURDAY_EVENING);
    await voidGame(db, jonah, michigan.id, "Stats never came", SATURDAY_EVENING);
    const { feed, reads } = statsFeed(MICHIGAN_FINAL);

    expect(await refresh(feed, SATURDAY_EVENING)).toBe("idle");

    const other = await setup();
    await other.finish(MICHIGAN_FINAL, SATURDAY_EVENING);
    const pastWaiting = new Date(other.michigan.kickoff.getTime() + STATS_WAIT_MS);
    expect(await other.refresh(feed, pastWaiting)).toBe("idle");
    expect(reads.teams).toBe(0);
  });
});

describe("failure isolation", () => {
  test("a failed stats call costs neither the scores nor the live plays, and a game going final gets its stats in the same request", async () => {
    const { db, michigan, reload } = await setup();
    const failing = statsFeed(MICHIGAN_FINAL, { teams: new Error("CollegeFootballData returned 500 for /games/teams.") });

    const slate = await freshSlate(db, () => failing.feed, SATURDAY_EVENING);

    expect(effectiveResult(slate!.games.find((g) => g.id === michigan.id)!)).toMatchObject({ status: "final" });
    expect(failing.reads.teams).toBe(1);
    expect(await finalStats(db, await reload(michigan.id))).toBeNull();

    // Five minutes on, the stats answer; the scores gate has nothing left to do for Michigan.
    const working = statsFeed(MICHIGAN_FINAL);
    await freshSlate(db, () => working.feed, minutes(SATURDAY_EVENING, 5));
    expect(await finalStats(db, await reload(michigan.id))).not.toBeNull();
  });
});

describe("reading a box score", () => {
  test("null while the game is not final, then the box score with its bar colours", async () => {
    const { db, jonah, finish, refresh, reload, michigan, texas } = await setup();
    expect(await finalStats(db, michigan)).toBeNull();

    await finish(MICHIGAN_FINAL, SATURDAY_EVENING);
    await refresh(statsFeed(MICHIGAN_FINAL).feed, SATURDAY_EVENING);

    const stats = await finalStats(db, await reload(michigan.id));
    // Oklahoma crimson away, Michigan navy home.
    expect(stats?.colors).toEqual({ away: "#841617", home: "#00274C" });
    expect(stats?.teamStats.find((r) => r.key === "totalYards")).toMatchObject({
      away: { display: "289" },
      home: { display: "263" },
    });
    expect(stats?.leaders.find((r) => r.key === "passing")?.home).toMatchObject({
      name: "Bryce Underwood",
      position: "QB",
      detail: "9/17",
    });
    expect(await finalStats(db, await reload(texas.id))).toBeNull();

    // Voided after its stats arrived: no longer final, so no box score.
    await voidGame(db, jonah, michigan.id, "Forfeit", SUNDAY);
    expect(await finalStats(db, await reload(michigan.id))).toBeNull();
  });

  test("the claim is one column on the Week, apart from the scores' claim", async () => {
    const { db, week, finish, refresh } = await setup();
    await finish(MICHIGAN_FINAL, SATURDAY_EVENING);

    await refresh(statsFeed(MICHIGAN_FINAL, { teams: [] }).feed, SATURDAY_EVENING);

    const row = await db.query.weeks.findFirst({ where: eq(weeks.id, week.id) });
    expect(row).toMatchObject({ statsFetchedAt: SATURDAY_EVENING, scoreboardFetchedAt: null });
  });
});
