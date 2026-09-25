import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { games, liveFeeds, weeks } from "@/db/schema";
import { sharedFeed } from "@/lib/cfbd/cache";
import { recordedCfbd } from "@/lib/cfbd/recorded";
import type { CfbdClient } from "@/lib/cfbd/types";
import { slateFor } from "@/lib/slate/slate";
import {
  FAMU_AT_MIAMI,
  feedWith,
  lockAs,
  pickAs,
  playsAt,
  OHIO_STATE_AT_TEXAS,
  OKLAHOMA_AT_MICHIGAN,
  publishWeek2,
  SATURDAY_EVENING,
  SUNDAY,
  THURSDAY,
} from "@/test/week-2";
import { effectiveResult } from "./result";
import { needsReview, resultAuditsFor } from "./results";
import {
  clearOverride,
  ingestResults,
  InvalidResult,
  overrideResult,
  refreshResultsIfStale,
  restoreGame,
  voidGame,
} from "./writes";

/**
 * The shared published Week 2 with Grandma's and Jonah's picks in. Ingest and
 * the stale gate take the Week as loaded rows, so each reader re-reads the
 * Slate: a void, an override, or an ingest in the middle of a test moves it.
 */
async function setup() {
  const fixture = await publishWeek2();
  const { db, slate, jonah, grandma, week, miami, michigan, texas } = fixture;

  await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY); // Michigan
  await pickAs(db, grandma, slate, texas, texas.awayTeamId, THURSDAY); // Ohio State
  await lockAs(db, grandma, slate, michigan.id, THURSDAY);
  await pickAs(db, jonah, slate, michigan, michigan.awayTeamId, THURSDAY); // Oklahoma
  await pickAs(db, jonah, slate, texas, texas.homeTeamId, THURSDAY); // Texas
  await pickAs(db, jonah, slate, miami, miami.homeTeamId, THURSDAY); // Miami

  return {
    ...fixture,
    reload: async (gameId: number) => (await db.query.games.findFirst({ where: eq(games.id, gameId) }))!,
    ingest: async (feed: CfbdClient, at: Date) => ingestResults(db, feed, await slateFor(db, week.id), at),
    refresh: async (feed: CfbdClient, at: Date) =>
      (await refreshResultsIfStale(db, feed, await slateFor(db, week.id), at)).outcome,
  };
}

/** Why the database turned a write away. Drizzle's own message is the SQL; the constraint is on the cause. */
async function refusal(query: Promise<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    return String((error as Error).cause ?? error);
  }
  throw new Error("The database accepted a row it should have refused.");
}

describe("results ingest", () => {
  test("pulls final scores for the week's games, marks them final, and is safe to run again", async () => {
    const { db, week, miami, michigan, texas, reload, ingest } = await setup();
    const feed = feedWith(
      { [FAMU_AT_MIAMI]: [7, 45], [OKLAHOMA_AT_MICHIGAN]: [24, 27] },
      { [OHIO_STATE_AT_TEXAS]: [3, 0, 1, "08:42", { possession: "home", situation: "1st & 10", lastPlay: "Quintrevion Wisner rush for 4 yards" }] },
    );

    expect(await ingest(feed, SATURDAY_EVENING)).toEqual({ changed: 3 });
    // One scoreboard read covers the slate; every game was on it, so `/games` was never needed.
    // The one game under way has its play-by-play read; the finals do not.
    expect(feed.reads).toEqual({ scoreboard: 1, games: 0, livePlays: 1 });

    expect(await reload(miami.id)).toMatchObject({ status: "final", awayScore: 7, homeScore: 45, period: null, clock: null });
    expect(await reload(michigan.id)).toMatchObject({ status: "final", awayScore: 24, homeScore: 27 });
    // Under way: in progress, with the running score and the clock, never final.
    expect(await reload(texas.id)).toMatchObject({
      status: "in_progress",
      awayScore: 3,
      homeScore: 0,
      period: 1,
      clock: "08:42",
      // Texas is the home side, and the feed said "home": stored as a side, never the raw string.
      possession: "home",
      situation: "1st & 10",
      lastPlay: "Quintrevion Wisner rush for 4 yards",
    });
    // The running score rides along as `live`, so a screen can show it without counting it.
    expect(effectiveResult(await reload(texas.id))).toEqual({
      status: "pending",
      homeScore: null,
      awayScore: null,
      source: null,
      live: {
        awayScore: 3,
        homeScore: 0,
        period: 1,
        clock: "08:42",
        possession: "home",
        situation: "1st & 10",
        lastPlay: "Quintrevion Wisner rush for 4 yards",
        // The play-by-play has logged nothing for it, so the row falls back to the scoreboard's detail above.
        feed: null,
      },
      // A running score is what to put on screen; it is still not what counts.
      shown: { awayScore: 3, homeScore: 0 },
      label: "In progress",
      note: null,
      feedFinal: null,
    });
    // The ingest does not claim the stale gate. It used to stamp this column
    // unconditionally, so "Check the feed now" — which calls the ingest
    // directly — suppressed the member-scheduled pull for five minutes.
    expect((await db.query.weeks.findFirst({ where: eq(weeks.id, week.id) }))!.scoreboardFetchedAt).toBeNull();

    // The same feed again changes nothing; a later feed changes only what moved.
    expect(await ingest(feed, SUNDAY)).toEqual({ changed: 0 });
    const later = feedWith({ [FAMU_AT_MIAMI]: [7, 45], [OKLAHOMA_AT_MICHIGAN]: [24, 27], [OHIO_STATE_AT_TEXAS]: [31, 28] });
    expect(await ingest(later, SUNDAY)).toEqual({ changed: 1 });
    // A final clears every live column, not just the clock: nothing has the ball once it is over.
    expect(await reload(texas.id)).toMatchObject({
      status: "final",
      awayScore: 31,
      homeScore: 28,
      period: null,
      clock: null,
      possession: null,
      situation: null,
      lastPlay: null,
    });
  });

  test("a game that rolls off the board does not keep showing the last thing it was seen doing", async () => {
    const { texas, reload, ingest } = await setup();

    await ingest(
      feedWith({}, { [OHIO_STATE_AT_TEXAS]: [3, 0, 1, "08:42", { possession: "home", situation: "1st & 10", lastPlay: "Wisner rush for 4" }] }),
      SATURDAY_EVENING,
    );
    expect(await reload(texas.id)).toMatchObject({ possession: "home", situation: "1st & 10" });

    // The board is the week being played, so a game can fall off it with its
    // final unread. `/games` is the backstop and carries none of the live
    // detail — it must null all five rather than leave them standing.
    const offBoard = feedWith({ [OHIO_STATE_AT_TEXAS]: [31, 28] }, {}, { offBoard: [OHIO_STATE_AT_TEXAS] });
    expect(await ingest(offBoard, SUNDAY)).toEqual({ changed: 1 });
    expect(await reload(texas.id)).toMatchObject({
      status: "final",
      awayScore: 31,
      homeScore: 28,
      period: null,
      clock: null,
      possession: null,
      situation: null,
      lastPlay: null,
    });
  });

  test("a drive that moves without the score moving is still a change worth writing", async () => {
    const { texas, reload, ingest } = await setup();
    const drive = (situation: string, lastPlay: string, possession: string) =>
      feedWith({}, { [OHIO_STATE_AT_TEXAS]: [3, 0, 1, "08:42", { possession, situation, lastPlay }] });

    await ingest(drive("1st & 10", "Quintrevion Wisner rush for 4 yards", "home"), SATURDAY_EVENING);
    expect(await reload(texas.id)).toMatchObject({ situation: "1st & 10", possession: "home" });

    // Same score, same clock, new down: `sameColumns` has to weigh the live
    // detail, or a board mid-drive would never look changed and would sit on
    // a stale last play for the rest of the quarter.
    expect(await ingest(drive("2nd & 6", "Arch Manning pass incomplete", "home"), SATURDAY_EVENING)).toEqual({
      changed: 1,
    });
    expect(await reload(texas.id)).toMatchObject({
      situation: "2nd & 6",
      lastPlay: "Arch Manning pass incomplete",
      awayScore: 3,
      homeScore: 0,
      clock: "08:42",
    });

    // A turnover moves nothing but the ball.
    expect(await ingest(drive("2nd & 6", "Arch Manning pass incomplete", "194"), SATURDAY_EVENING)).toEqual({
      changed: 1,
    });
    // Ohio State is the away side, placed from its ESPN id.
    expect(await reload(texas.id)).toMatchObject({ possession: "away" });

    // Nothing moved at all: still no write.
    expect(await ingest(drive("2nd & 6", "Arch Manning pass incomplete", "194"), SATURDAY_EVENING)).toEqual({
      changed: 0,
    });
  });

  test("the database refuses a game that says final without both scores", async () => {
    const { db, week } = await setup();
    const row = {
      weekId: week.id,
      cfbdGameId: 999,
      homeTeamId: 1,
      homeTeam: "Texas",
      awayTeamId: 2,
      awayTeam: "Ohio State",
      kickoff: SATURDAY_EVENING,
      status: "final" as const,
    };
    expect(await refusal(db.insert(games).values(row))).toMatch(/games_final_has_scores/);
    expect(await refusal(db.insert(games).values({ ...row, awayScore: 3 }))).toMatch(/games_final_has_scores/);
    // Both scores, or not final at all: fine.
    await db.insert(games).values({ ...row, awayScore: 3, homeScore: 0 });
    await db.insert(games).values({ ...row, cfbdGameId: 998, status: "scheduled" });
  });

  test("a game the feed never completes stays pending and is flagged for review hours after kickoff", async () => {
    const { texas, michigan, reload, ingest } = await setup();
    await ingest(feedWith({ [OKLAHOMA_AT_MICHIGAN]: [24, 27] }), SUNDAY);

    const pending = await reload(texas.id);
    expect(effectiveResult(pending)).toEqual({
      status: "pending",
      homeScore: null,
      awayScore: null,
      source: null,
      live: null,
      shown: null,
      label: "Scheduled",
      note: null,
      feedFinal: null,
    });
    expect(needsReview(pending, SATURDAY_EVENING)).toBe(false); // it has not kicked off yet
    expect(needsReview(pending, new Date("2026-09-13T03:00:00Z"))).toBe(false); // 3.5 hours in: could still be playing
    expect(needsReview(pending, SUNDAY)).toBe(true); // 12.5 hours later with no final: postponed or the feed is stuck
    expect(needsReview(await reload(michigan.id), SUNDAY)).toBe(false); // final games never need review
  });

  test("the stale gate calls the feed only when a pending game has kicked off, at most every five minutes", async () => {
    const { db, jonah, michigan, texas, week, reload, refresh } = await setup();
    const quiet = feedWith({});

    // Nothing has kicked off: no call.
    expect(await refresh(quiet, THURSDAY)).toBe("idle");
    expect(quiet.calls).toBe(0);

    // Miami is past kickoff and not final: one call, then none for five minutes.
    const friday = new Date("2026-09-11T01:00:00Z");
    expect(await refresh(quiet, friday)).toBe("refreshed");
    // The gate is the one writer of the claim, and it writes it when it claims.
    expect((await db.query.weeks.findFirst({ where: eq(weeks.id, week.id) }))!.scoreboardFetchedAt).toEqual(friday);
    expect(await refresh(quiet, new Date(friday.getTime() + 4 * 60_000))).toBe("fresh");
    expect(quiet.calls).toBe(1);
    expect(await refresh(quiet, new Date(friday.getTime() + 5 * 60_000))).toBe("refreshed");
    expect(quiet.calls).toBe(2);

    // Once every kicked-off game is final (Texas has not started), the gate goes idle without a call.
    const finals = feedWith({ [FAMU_AT_MIAMI]: [7, 45], [OKLAHOMA_AT_MICHIGAN]: [24, 27] });
    expect(await refresh(finals, SATURDAY_EVENING)).toBe("refreshed");
    expect(await reload(michigan.id)).toMatchObject({ status: "final" });
    expect(await refresh(finals, new Date(SATURDAY_EVENING.getTime() + 6 * 60_000))).toBe("idle");
    expect(finals.calls).toBe(1);

    // A void game does not keep the feed polling; an override that makes a game final does not either.
    await voidGame(db, jonah, texas.id, "Hurricane");
    expect(await refresh(finals, SUNDAY)).toBe("idle");
    await restoreGame(db, jonah, texas.id);
    await overrideResult(db, jonah, texas.id, { awayScore: 31, homeScore: 28, note: "Feed stuck" });
    expect(await refresh(finals, SUNDAY)).toBe("idle");
    expect(finals.calls).toBe(1);
  });

  test("a slate game the board does not list is read from /games, and a listed one never is", async () => {
    const { reload, ingest, miami, michigan, texas } = await setup();
    // The board has rolled past Michigan's final. `/games` has it; the board
    // does not. And the two disagree about Miami — the board says it is still
    // going, `/games` says it finished — which is how the test tells which
    // feed a listed game was read from.
    const feed = feedWith(
      { [OKLAHOMA_AT_MICHIGAN]: [24, 27], [FAMU_AT_MIAMI]: [7, 45] },
      {},
      { offBoard: [OKLAHOMA_AT_MICHIGAN] },
    );
    const board = feed.scoreboard;
    feed.scoreboard = async () =>
      (await board()).map((g) =>
        g.id === FAMU_AT_MIAMI
          ? {
              ...g,
              status: "in_progress",
              period: 4,
              clock: "01:00",
              awayTeam: { ...g.awayTeam, points: 7 },
              homeTeam: { ...g.homeTeam, points: 38 },
            }
          : g,
      );

    expect(await ingest(feed, SATURDAY_EVENING)).toEqual({ changed: 2 });
    // One board read, one `/games` read for the game it left out, and Miami's play-by-play.
    expect(feed.reads).toEqual({ scoreboard: 1, games: 1, livePlays: 1 });
    expect(await reload(michigan.id)).toMatchObject({ status: "final", awayScore: 24, homeScore: 27 });
    // Miami was on the board, so the board's word stands over the feed's final.
    expect(await reload(miami.id)).toMatchObject({ status: "in_progress", awayScore: 7, homeScore: 38, period: 4 });
    // Texas is off the board too, but has not kicked off: nothing to read for it.
    expect(await reload(texas.id)).toMatchObject({ status: "scheduled" });

    // Michigan is final now, so the next pass has nothing unlisted to chase.
    await ingest(feed, SUNDAY);
    expect(feed.reads).toEqual({ scoreboard: 2, games: 1, livePlays: 2 });
  });

  test("the gate holds thirty seconds while a game is under way and five minutes between games", async () => {
    const { michigan, reload, refresh } = await setup();
    const kickoff = new Date("2026-09-12T16:05:00Z");
    const at = (seconds: number) => new Date(kickoff.getTime() + seconds * 1000);

    // Nothing under way yet, though Miami is past kickoff: the five-minute tier.
    const live = feedWith({}, { [OKLAHOMA_AT_MICHIGAN]: [7, 3, 1, "10:00"] });
    expect(await refresh(live, kickoff)).toBe("refreshed");
    expect(await reload(michigan.id)).toMatchObject({ status: "in_progress", period: 1 });

    // Michigan is under way now, so the gate reopens after thirty seconds rather than five minutes.
    expect(await refresh(live, at(29))).toBe("fresh");
    expect(await refresh(live, at(30))).toBe("refreshed");
    // Each claim is a scoreboard read and one play-by-play read for the one live game.
    expect(live.reads).toEqual({ scoreboard: 2, games: 0, livePlays: 2 });

    // Michigan ends. Miami is still pending past kickoff, so the gate stays open — on the slower tier.
    const done = feedWith({ [OKLAHOMA_AT_MICHIGAN]: [24, 27] });
    expect(await refresh(done, at(180))).toBe("refreshed");
    expect(await reload(michigan.id)).toMatchObject({ status: "final", period: null, clock: null });
    expect(await refresh(done, at(180 + 30))).toBe("fresh");
    expect(await refresh(done, at(180 + 299))).toBe("fresh");
    expect(await refresh(done, at(180 + 300))).toBe("refreshed");
    expect(done.calls).toBe(2);
  });

  test("concurrent requests elect one caller, and the rest read what it wrote", async () => {
    const { refresh } = await setup();
    const feed = feedWith({});
    const friday = new Date("2026-09-11T01:00:00Z");

    const outcomes = await Promise.all([refresh(feed, friday), refresh(feed, friday), refresh(feed, friday)]);

    expect(outcomes.filter((o) => o === "refreshed")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "fresh")).toHaveLength(2);
    expect(feed.calls).toBe(1);
  });

  test("a commissioner's refresh is not undone by the next member visit", async () => {
    const { michigan, reload, ingest, refresh } = await setup();
    // The production arrangement, on a clock this test turns: one ten-minute
    // cache with a door for member traffic and a door for the refresh button.
    // `world` is what CollegeFootballData would answer if asked right now.
    let world = feedWith({});
    let clock = 0;
    const feed = sharedFeed(
      { ...recordedCfbd("2026-week-2"), games: (q) => world.games(q), scoreboard: () => world.scoreboard() },
      10 * 60_000,
      () => clock,
    );
    const at = (minutes: number) => new Date(SATURDAY_EVENING.getTime() + minutes * 60_000);
    const tick = (minutes: number) => (clock = minutes * 60_000);

    // Member traffic pulls the feed while Michigan is still going. The cache holds that answer.
    expect(await refresh(feed.cfbd(), at(0))).toBe("refreshed");
    expect(await reload(michigan.id)).toMatchObject({ status: "scheduled" });

    // The game ends: CollegeFootballData knows, the cache does not.
    world = feedWith({ [OKLAHOMA_AT_MICHIGAN]: [24, 27] });
    tick(2);

    // "Check the feed now". The read goes through, and the cache keeps what it read.
    await ingest(feed.freshCfbd(), at(2));
    expect(await reload(michigan.id)).toMatchObject({ status: "final", awayScore: 24, homeScore: 27 });

    // Five minutes on, the stale gate reopens — still inside the ten-minute
    // cache. A refresh that had skipped the cache rather than emptying it would
    // leave the pre-final answer sitting there for this visit to write back,
    // and the score on screen would go backwards.
    tick(7);
    expect(await refresh(feed.cfbd(), at(7))).toBe("refreshed");
    expect(await reload(michigan.id)).toMatchObject({ status: "final", awayScore: 24, homeScore: 27 });
  });

  test("a commissioner's feed check does not claim the member gate", async () => {
    const { db, week, ingest, refresh } = await setup();
    const feed = feedWith({});
    const claim = async () => (await db.query.weeks.findFirst({ where: eq(weeks.id, week.id) }))!.scoreboardFetchedAt;
    // Miami is past kickoff with nothing final, so the gate has work to do.
    const friday = new Date("2026-09-11T01:00:00Z");

    expect(await refresh(feed, friday)).toBe("refreshed");
    expect(await claim()).toEqual(friday);

    // "Check the feed now" a minute later. It pulls the feed and leaves the
    // claim where the member pull put it.
    await ingest(feed, new Date(friday.getTime() + 60_000));
    expect(await claim()).toEqual(friday);

    // So the gate reopens five minutes after the member pull, not five after
    // the commissioner's. The stamp inside the ingest used to push it out,
    // which is exactly the five minutes of member traffic it cost.
    expect(await refresh(feed, new Date(friday.getTime() + 5 * 60_000))).toBe("refreshed");
  });
});

describe("live play-by-play", () => {
  /** A game's stored feed row, or undefined before its first fetch. */
  const storedFeed = (db: Awaited<ReturnType<typeof setup>>["db"], gameId: number) =>
    db.query.liveFeeds.findFirst({ where: eq(liveFeeds.gameId, gameId) });

  test("each live game's feed is stored, and its row carries the newest play and the next snap", async () => {
    const { db, texas, michigan, miami, reload, ingest } = await setup();
    const feed = feedWith(
      { [FAMU_AT_MIAMI]: [7, 45] },
      { [OHIO_STATE_AT_TEXAS]: [3, 0, 1, "08:42"], [OKLAHOMA_AT_MICHIGAN]: [0, 0, 1, "15:00"] },
      { plays: { [OHIO_STATE_AT_TEXAS]: playsAt(OHIO_STATE_AT_TEXAS, [3, 0], 1, "8:42") } },
    );

    await ingest(feed, SATURDAY_EVENING);

    // Both games under way are fetched; the final is not.
    expect(feed.reads.livePlays).toBe(2);
    const stored = await storedFeed(db, texas.id);
    expect(stored?.fetchedAt).toEqual(SATURDAY_EVENING);
    expect(stored?.drives.flatMap((d) => d.plays).map((p) => p.playType)).toEqual([
      "Pass Incompletion",
      "Timeout",
      "Penalty",
      "Rush",
    ]);
    // The drives, each with its plays, and when: `teams[]` is CFBD's advanced metrics, and nothing keeps it.
    expect(Object.keys(stored!).sort()).toEqual(["drives", "fetchedAt", "gameId"]);
    expect(stored!.drives[0]).not.toHaveProperty("teams");
    expect(effectiveResult(await reload(texas.id)).live?.feed).toMatchObject({
      play: { type: "Rush", team: "Liberty", clock: "8:42", wallClock: "2026-09-25T00:52:07.000Z" },
      down: 2,
      distance: 7,
      yardsToGoal: 31,
    });
    // Michigan's feed has logged nothing yet: a row is stored, and the Live Board falls back to the scoreboard.
    expect((await storedFeed(db, michigan.id))?.drives).toEqual([]);
    expect(effectiveResult(await reload(michigan.id)).live?.feed).toBeNull();
    expect(await storedFeed(db, miami.id)).toBeUndefined();

    // The same feed again rewrites the stored plays, but no row: its slice came back from `jsonb` unchanged.
    expect(await ingest(feed, SUNDAY)).toEqual({ changed: 0 });
    expect((await storedFeed(db, texas.id))?.fetchedAt).toEqual(SUNDAY);
  });

  test("while a game is live its score is the feed's when the feed is ahead, and its final is only ever the scoreboard's", async () => {
    const { db, texas, reload, ingest } = await setup();
    // The scoreboard is still at 3–0 in the first quarter; the feed has Texas scoring since.
    const ahead = feedWith(
      {},
      { [OHIO_STATE_AT_TEXAS]: [3, 0, 1, "08:42"] },
      { plays: { [OHIO_STATE_AT_TEXAS]: playsAt(OHIO_STATE_AT_TEXAS, [3, 7], 1, "6:10") } },
    );

    await ingest(ahead, SATURDAY_EVENING);

    const row = await reload(texas.id);
    // The row keeps the scoreboard's own score; the shown score is the feed's.
    expect(row).toMatchObject({ status: "in_progress", awayScore: 3, homeScore: 0 });
    const result = effectiveResult(row);
    expect(result.live).toMatchObject({ awayScore: 3, homeScore: 7, period: 1, clock: "08:42" });
    // `shown` is what the "currently winning" colours read.
    expect(result.shown).toEqual({ awayScore: 3, homeScore: 7 });
    expect(result.status).toBe("pending");

    // The feed's last word before the final disagrees with the scoreboard's final; the scoreboard grades.
    const final = feedWith(
      { [OHIO_STATE_AT_TEXAS]: [31, 28] },
      {},
      { plays: { [OHIO_STATE_AT_TEXAS]: playsAt(OHIO_STATE_AT_TEXAS, [31, 35], 4, "0:00") } },
    );
    await ingest(final, SUNDAY);
    expect(final.reads.livePlays).toBe(0);
    const graded = await reload(texas.id);
    expect(effectiveResult(graded)).toMatchObject({ status: "final", awayScore: 31, homeScore: 28, live: null });
    // A final clears the row's slice; the stored plays stay.
    expect(graded.liveFeed).toBeNull();
    expect((await storedFeed(db, texas.id))?.drives).toHaveLength(1);
  });

  test("one game's failed fetch keeps its last plays and fails nothing else", async () => {
    const { db, texas, michigan, reload, ingest } = await setup();
    const first = feedWith(
      {},
      { [OHIO_STATE_AT_TEXAS]: [3, 0, 1, "08:42"], [OKLAHOMA_AT_MICHIGAN]: [0, 0, 1, "15:00"] },
      {
        plays: {
          [OHIO_STATE_AT_TEXAS]: playsAt(OHIO_STATE_AT_TEXAS, [3, 0], 1, "8:42"),
          [OKLAHOMA_AT_MICHIGAN]: playsAt(OKLAHOMA_AT_MICHIGAN, [0, 0], 1, "15:00"),
        },
      },
    );
    await ingest(first, SATURDAY_EVENING);
    const texasBefore = await reload(texas.id);

    // Next pass: Texas's call times out; Michigan's answers, and the scoreboard moves both.
    const later = new Date(SATURDAY_EVENING.getTime() + 30_000);
    const second = feedWith(
      {},
      { [OHIO_STATE_AT_TEXAS]: [10, 0, 1, "05:00"], [OKLAHOMA_AT_MICHIGAN]: [0, 7, 1, "11:00"] },
      {
        plays: {
          [OHIO_STATE_AT_TEXAS]: new DOMException("The operation was aborted due to timeout", "TimeoutError"),
          [OKLAHOMA_AT_MICHIGAN]: playsAt(OKLAHOMA_AT_MICHIGAN, [0, 7], 1, "11:00"),
        },
      },
    );
    expect(await ingest(second, later)).toEqual({ changed: 2 });

    // Texas keeps the plays and slice it had; the scoreboard's word still lands.
    expect((await storedFeed(db, texas.id))?.fetchedAt).toEqual(SATURDAY_EVENING);
    const texasAfter = await reload(texas.id);
    expect(texasAfter.liveFeed).toEqual(texasBefore.liveFeed);
    expect(texasAfter).toMatchObject({ awayScore: 10, clock: "05:00" });
    // Its stored play is from earlier in the game than the scoreboard now is, so the scoreboard's score shows.
    expect(effectiveResult(texasAfter).shown).toEqual({ awayScore: 10, homeScore: 0 });
    // Michigan is untouched by Texas's failure.
    expect((await storedFeed(db, michigan.id))?.fetchedAt).toEqual(later);
    expect(effectiveResult(await reload(michigan.id)).live?.feed?.play).toMatchObject({ clock: "11:00", homeScore: 7 });
  });

  test("a Void or overridden game is never fetched, whatever the scoreboard says", async () => {
    const { db, jonah, texas, michigan, ingest } = await setup();
    await voidGame(db, jonah, texas.id, "Hurricane");
    await overrideResult(db, jonah, michigan.id, { awayScore: 24, homeScore: 27, note: "Feed stuck" });
    const feed = feedWith({}, { [OHIO_STATE_AT_TEXAS]: [3, 0, 1, "08:42"], [OKLAHOMA_AT_MICHIGAN]: [0, 0, 1, "15:00"] });

    await ingest(feed, SATURDAY_EVENING);

    expect(feed.reads.livePlays).toBe(0);
  });
});

describe("result overrides", () => {
  test("a commissioner's override beats the feed, is logged, and can be cleared back to the feed", async () => {
    const { db, jonah, week, michigan, texas, reload, ingest } = await setup();
    const feed = feedWith({ [OKLAHOMA_AT_MICHIGAN]: [24, 27] });
    await ingest(feed, SATURDAY_EVENING);

    // `overrideResult` takes a `Commissioner`, so a member calling it is a type
    // error here rather than a rejection — see `authority.ts`.
    await expect(overrideResult(db, jonah, michigan.id, { awayScore: 30, homeScore: 27, note: "  " })).rejects.toThrow(
      InvalidResult,
    );
    // The score range is not asserted here. It belongs to the form parse in
    // `console-edits.ts`, and calling this function directly walks past it, so
    // a `-1` case here passed while the sentence a commissioner actually read
    // for `-1` said "Missing awayScore." It is pinned on `editResult`, by
    // message, in `console-edits.test.ts`.

    await overrideResult(db, jonah, michigan.id, { awayScore: 30, homeScore: 27, note: "Feed missed the late FG" });
    let game = await reload(michigan.id);
    expect(effectiveResult(game)).toEqual({
      status: "final",
      awayScore: 30,
      homeScore: 27,
      source: "override",
      live: null,
      shown: { awayScore: 30, homeScore: 27 },
      label: "Final · override",
      note: "Feed missed the late FG",
      // The override stands over a feed final, and the console shows what it overrode.
      feedFinal: { awayScore: 24, homeScore: 27 },
    });
    // The feed columns stay what the feed said, and a re-ingest does not disturb the override.
    expect(game).toMatchObject({ awayScore: 24, homeScore: 27, overrideAwayScore: 30, overrideHomeScore: 27 });
    await ingest(feed, SUNDAY);
    expect(effectiveResult(await reload(michigan.id))).toMatchObject({ awayScore: 30, source: "override" });

    // An override on a game the feed has not finished makes it final on its own.
    await overrideResult(db, jonah, texas.id, { awayScore: 31, homeScore: 28, note: "Feed stuck on Sunday" });
    expect(effectiveResult(await reload(texas.id))).toEqual({
      status: "final",
      awayScore: 31,
      homeScore: 28,
      source: "override",
      live: null,
      shown: { awayScore: 31, homeScore: 28 },
      label: "Final · override",
      note: "Feed stuck on Sunday",
      // Nothing to have overridden: the feed never finished this one.
      feedFinal: null,
    });

    await clearOverride(db, jonah, michigan.id);
    game = await reload(michigan.id);
    expect(effectiveResult(game)).toEqual({
      status: "final",
      awayScore: 24,
      homeScore: 27,
      source: "feed",
      live: null,
      shown: { awayScore: 24, homeScore: 27 },
      label: "Final",
      note: null,
      feedFinal: null,
    });
    expect(game.overrideNote).toBeNull();

    const log = await resultAuditsFor(db, jonah, week.id);
    expect(log.map((a) => [a.gameId, a.kind, a.previousValue, a.newValue, a.note])).toEqual([
      [michigan.id, "override", "Oklahoma 24, Michigan 27", "Oklahoma 30, Michigan 27", "Feed missed the late FG"],
      [texas.id, "override", "pending", "Ohio State 31, Texas 28", "Feed stuck on Sunday"],
      [michigan.id, "clear_override", "Oklahoma 30, Michigan 27", "Oklahoma 24, Michigan 27", null],
    ]);
    expect(log.every((a) => a.changedBy === jonah.id)).toBe(true);
  });

  test("void and restore are logged, a void game cannot take a score, and a restore keeps the feed's score", async () => {
    const { db, jonah, week, michigan, reload, ingest } = await setup();
    await ingest(feedWith({ [OKLAHOMA_AT_MICHIGAN]: [24, 27] }), SATURDAY_EVENING);

    await voidGame(db, jonah, michigan.id, "Lightning; never resumed");
    expect(effectiveResult(await reload(michigan.id))).toEqual({
      status: "void",
      homeScore: null,
      awayScore: null,
      source: null,
      live: null,
      shown: null,
      label: "Void",
      note: "Lightning; never resumed",
      feedFinal: null,
    });
    await expect(overrideResult(db, jonah, michigan.id, { awayScore: 24, homeScore: 27, note: "n" })).rejects.toThrow(
      /void/i,
    );
    await expect(restoreGame(db, jonah, 9999)).rejects.toThrow(InvalidResult); // no such game

    const restored = await restoreGame(db, jonah, michigan.id);
    expect(restored).toMatchObject({ void: false, voidNote: null });
    expect(effectiveResult(restored)).toEqual({
      status: "final",
      awayScore: 24,
      homeScore: 27,
      source: "feed",
      live: null,
      shown: { awayScore: 24, homeScore: 27 },
      label: "Final",
      note: null,
      feedFinal: null,
    });
    await expect(restoreGame(db, jonah, michigan.id)).rejects.toThrow(/not void/i);

    const log = await resultAuditsFor(db, jonah, week.id);
    expect(log.map((a) => [a.kind, a.previousValue, a.newValue, a.note])).toEqual([
      ["void", "Oklahoma 24, Michigan 27", "void", "Lightning; never resumed"],
      ["restore", "void", "Oklahoma 24, Michigan 27", null],
    ]);
  });
});

describe("which state a Game can move to", () => {
  test("a Void needs a published slate and a note, and one already void is refused rather than re-voided", async () => {
    const { db, jonah, week, michigan, reload } = await setup();

    await expect(voidGame(db, jonah, michigan.id, "  ")).rejects.toThrow(InvalidResult);
    await expect(voidGame(db, jonah, 9999, "Hurricane")).rejects.toThrow(InvalidResult); // no such game

    await voidGame(db, jonah, michigan.id, "Lightning; never resumed");
    // A second Void used to return quietly, drop this note, and still tell the
    // commissioner "Voided." The first note stands, and the log has one row.
    await expect(voidGame(db, jonah, michigan.id, "Called off for good")).rejects.toThrow("That game is already void.");
    expect(await reload(michigan.id)).toMatchObject({ void: true, voidNote: "Lightning; never resumed" });
    expect((await resultAuditsFor(db, jonah, week.id)).map((a) => a.kind)).toEqual(["void"]);
  });

  test("an Override has to exist before it can be cleared, and a refused change writes no audit row", async () => {
    const { db, jonah, week, michigan } = await setup();

    await expect(clearOverride(db, jonah, michigan.id)).rejects.toThrow("That game has no override.");
    await expect(restoreGame(db, jonah, michigan.id)).rejects.toThrow("That game is not void.");
    expect(await resultAuditsFor(db, jonah, week.id)).toEqual([]);
  });
});
