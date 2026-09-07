import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { games, weeks, type Member } from "@/db/schema";
import { recordedCfbd, recordings } from "@/lib/cfbd/recorded";
import type { CfbdClient, CfbdGame } from "@/lib/cfbd/types";
import { NotCommissioner } from "@/lib/members/members";
import { PicksHidden, savePick, setLock } from "@/lib/picks/picks";
import { slateFor, voidGame } from "@/lib/slate/slate";
import {
  FAMU_AT_MIAMI,
  OHIO_STATE_AT_TEXAS,
  OKLAHOMA_AT_MICHIGAN,
  publishWeek2,
  SATURDAY_EVENING,
  SUNDAY,
  THURSDAY,
} from "@/test/week-2";
import {
  clearOverride,
  effectiveResult,
  ingestResults,
  InvalidResult,
  needsReview,
  overrideResult,
  refreshResultsIfStale,
  restoreGame,
  resultAuditsFor,
  resultsConsole,
  REVIEW_AFTER_MS,
  reviewNotice,
  seasonResult,
  weekResult,
} from "./results";

type Finals = Record<number, [away: number, home: number]>;

/** The Week 2 recording with some games reported final. `calls` counts feed reads. */
function feedWith(finals: Finals, live: Finals = {}): CfbdClient & { calls: number } {
  const feedGames: CfbdGame[] = recordings["2026-week-2"].games.map((g) => {
    const final = finals[g.id];
    const inPlay = live[g.id];
    if (final) return { ...g, completed: true, awayPoints: final[0], homePoints: final[1] };
    if (inPlay) return { ...g, completed: false, awayPoints: inPlay[0], homePoints: inPlay[1] };
    return g;
  });
  const inner = recordedCfbd("2026-week-2", { games: feedGames });
  const client = {
    ...inner,
    calls: 0,
    games: async (q: { year: number; week: number }) => {
      client.calls += 1;
      return inner.games(q);
    },
  };
  return client;
}

/**
 * The shared published Week 2 with Grandma's and Jonah's picks in. Ingest, the
 * stale gate, and the Reveal all take the Week as loaded rows, so each reader
 * re-reads the Slate: a void, an override, or an ingest in the middle of a
 * test moves it.
 */
async function setup() {
  const fixture = await publishWeek2();
  const { db, jonah, grandma, week, miami, michigan, texas } = fixture;

  await savePick(db, grandma, week.id, michigan.id, michigan.homeTeamId, THURSDAY); // Michigan
  await savePick(db, grandma, week.id, texas.id, texas.awayTeamId, THURSDAY); // Ohio State
  await setLock(db, grandma, week.id, michigan.id, THURSDAY);
  await savePick(db, jonah, week.id, michigan.id, michigan.awayTeamId, THURSDAY); // Oklahoma
  await savePick(db, jonah, week.id, texas.id, texas.homeTeamId, THURSDAY); // Texas
  await savePick(db, jonah, week.id, miami.id, miami.homeTeamId, THURSDAY); // Miami

  return {
    ...fixture,
    reload: async (gameId: number) => (await db.query.games.findFirst({ where: eq(games.id, gameId) }))!,
    ingest: async (feed: CfbdClient, at: Date) => ingestResults(db, feed, await slateFor(db, week.id), at),
    refresh: async (feed: CfbdClient, at: Date) =>
      (await refreshResultsIfStale(db, feed, await slateFor(db, week.id), at)).outcome,
    gradeAt: async (actor: Member, at: Date) => weekResult(db, actor, await slateFor(db, week.id), at),
    revealAt: async (actor: Member, at: Date) => (await weekResult(db, actor, await slateFor(db, week.id), at)).reveal,
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
    const feed = feedWith({ [FAMU_AT_MIAMI]: [7, 45], [OKLAHOMA_AT_MICHIGAN]: [24, 27] }, { [OHIO_STATE_AT_TEXAS]: [3, 0] });

    expect(await ingest(feed, SATURDAY_EVENING)).toEqual({ changed: 3 });

    expect(await reload(miami.id)).toMatchObject({ status: "final", awayScore: 7, homeScore: 45 });
    expect(await reload(michigan.id)).toMatchObject({ status: "final", awayScore: 24, homeScore: 27 });
    // Not completed but scoring: in progress, with the running score, never final.
    expect(await reload(texas.id)).toMatchObject({ status: "in_progress", awayScore: 3, homeScore: 0 });
    // The running score rides along as `live`, so a screen can show it without counting it.
    expect(effectiveResult(await reload(texas.id))).toEqual({
      status: "pending",
      homeScore: null,
      awayScore: null,
      source: null,
      live: { awayScore: 3, homeScore: 0 },
      // A running score is what to put on screen; it is still not what counts.
      shown: { awayScore: 3, homeScore: 0 },
      label: "In progress",
      note: null,
      feedFinal: null,
    });
    expect((await db.query.weeks.findFirst({ where: eq(weeks.id, week.id) }))!.scoreboardFetchedAt).toEqual(
      SATURDAY_EVENING,
    );

    // The same feed again changes nothing; a later feed changes only what moved.
    expect(await ingest(feed, SUNDAY)).toEqual({ changed: 0 });
    const later = feedWith({ [FAMU_AT_MIAMI]: [7, 45], [OKLAHOMA_AT_MICHIGAN]: [24, 27], [OHIO_STATE_AT_TEXAS]: [31, 28] });
    expect(await ingest(later, SUNDAY)).toEqual({ changed: 1 });
    expect(await reload(texas.id)).toMatchObject({ status: "final", awayScore: 31, homeScore: 28 });
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
    const { db, jonah, michigan, texas, reload, refresh } = await setup();
    const quiet = feedWith({});

    // Nothing has kicked off: no call.
    expect(await refresh(quiet, THURSDAY)).toBe("idle");
    expect(quiet.calls).toBe(0);

    // Miami is past kickoff and not final: one call, then none for five minutes.
    const friday = new Date("2026-09-11T01:00:00Z");
    expect(await refresh(quiet, friday)).toBe("refreshed");
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
});

describe("result overrides", () => {
  test("a commissioner's override beats the feed, is logged, and can be cleared back to the feed", async () => {
    const { db, jonah, grandma, week, michigan, texas, reload, ingest } = await setup();
    const feed = feedWith({ [OKLAHOMA_AT_MICHIGAN]: [24, 27] });
    await ingest(feed, SATURDAY_EVENING);

    await expect(overrideResult(db, grandma, michigan.id, { awayScore: 30, homeScore: 27, note: "x" })).rejects.toThrow(
      NotCommissioner,
    );
    await expect(overrideResult(db, jonah, michigan.id, { awayScore: 30, homeScore: 27, note: "  " })).rejects.toThrow(
      InvalidResult,
    );
    await expect(overrideResult(db, jonah, michigan.id, { awayScore: -1, homeScore: 27, note: "typo" })).rejects.toThrow(
      InvalidResult,
    );
    await expect(overrideResult(db, jonah, michigan.id, { awayScore: 2.5, homeScore: 27, note: "typo" })).rejects.toThrow(
      InvalidResult,
    );

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
    await expect(resultAuditsFor(db, grandma, week.id)).rejects.toThrow(NotCommissioner);
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

describe("the reveal", () => {
  test("is refused before the deadline and shows every member's pick per game, graded once the game is final", async () => {
    const { jonah, grandma, miami, michigan, texas, deadline, ingest, revealAt } = await setup();
    await ingest(feedWith({ [OKLAHOMA_AT_MICHIGAN]: [24, 27] }), SATURDAY_EVENING);

    await expect(revealAt(grandma, new Date(deadline.getTime() - 1))).rejects.toThrow(PicksHidden);
    await expect(revealAt(jonah, THURSDAY)).rejects.toThrow(PicksHidden);

    const reveal = await revealAt(grandma, SATURDAY_EVENING);
    expect(reveal.members.map((m) => m.displayName)).toEqual(["Jonah", "Grandma"]);
    expect(reveal.games.map((g) => g.game.id)).toEqual([miami.id, michigan.id, texas.id]);

    const [miamiRow, michiganRow, texasRow] = reveal.games;
    // A final game grades each pick; an unpicked game leaves the member off the game.
    expect(michiganRow.result).toEqual({
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
    expect(michiganRow.picks).toEqual([
      { memberId: jonah.id, teamId: michigan.awayTeamId, outcome: "incorrect", locked: false, lockDropped: false },
      { memberId: grandma.id, teamId: michigan.homeTeamId, outcome: "correct", locked: true, lockDropped: false },
    ]);
    // A pending game shows the picks without a grade.
    expect(texasRow.result.status).toBe("pending");
    expect(texasRow.picks.map((p) => [p.memberId, p.outcome])).toEqual([
      [jonah.id, "pending"],
      [grandma.id, "pending"],
    ]);
    expect(miamiRow.picks).toEqual([
      { memberId: jonah.id, teamId: miami.homeTeamId, outcome: "pending", locked: false, lockDropped: false },
    ]);
  });

  test("a void game shows picks as void and an override regrades on the next read", async () => {
    const { db, jonah, grandma, michigan, texas, ingest, revealAt } = await setup();
    await ingest(feedWith({ [OKLAHOMA_AT_MICHIGAN]: [24, 27] }), SATURDAY_EVENING);
    await voidGame(db, jonah, texas.id, "Postponed to December");
    await overrideResult(db, jonah, michigan.id, { awayScore: 30, homeScore: 27, note: "Feed missed the late FG" });

    const reveal = await revealAt(jonah, SUNDAY);
    const michiganRow = reveal.games.find((g) => g.game.id === michigan.id)!;
    expect(michiganRow.result).toMatchObject({ awayScore: 30, source: "override" });
    expect(michiganRow.picks.map((p) => [p.memberId, p.outcome, p.locked])).toEqual([
      [jonah.id, "correct", false],
      [grandma.id, "incorrect", true],
    ]);
    const texasRow = reveal.games.find((g) => g.game.id === texas.id)!;
    expect(texasRow.result.status).toBe("void");
    expect(texasRow.picks.map((p) => p.outcome)).toEqual(["void", "void"]);
  });

  test("a Dropped Lock stays on the board, so its owner is not mistaken for a member who set none", async () => {
    const { db, jonah, grandma, week, michigan, texas, ingest, revealAt } = await setup();
    await setLock(db, jonah, week.id, texas.id, THURSDAY);
    await ingest(feedWith({ [OKLAHOMA_AT_MICHIGAN]: [24, 27] }), SATURDAY_EVENING);
    await voidGame(db, jonah, texas.id, "Postponed to December");

    const reveal = await revealAt(jonah, SUNDAY);

    // Jonah spent his Lock on the game that was voided. It scores nothing, but the board still shows he spent it.
    const texasRow = reveal.games.find((g) => g.game.id === texas.id)!;
    expect(texasRow.picks.map((p) => [p.memberId, p.locked, p.lockDropped])).toEqual([
      [jonah.id, false, true],
      [grandma.id, false, false],
    ]);

    // Grandma's Lock sits on a live game, so the Void leaves it counting.
    const michiganRow = reveal.games.find((g) => g.game.id === michigan.id)!;
    expect(michiganRow.picks.map((p) => [p.memberId, p.locked, p.lockDropped])).toEqual([
      [jonah.id, false, false],
      [grandma.id, true, false],
    ]);
  });
});

/** Every game reported: Miami and Michigan win at home, Ohio State wins at Texas 31–28. */
const ALL_FINAL: Finals = {
  [FAMU_AT_MIAMI]: [7, 45],
  [OKLAHOMA_AT_MICHIGAN]: [24, 27],
  [OHIO_STATE_AT_TEXAS]: [31, 28],
};

describe("the week result", () => {
  test("hands back the Weekly Scores and the Weekly Win the board was graded from", async () => {
    const { jonah, grandma, michigan, ingest, gradeAt } = await setup();
    await ingest(feedWith(ALL_FINAL), SUNDAY);

    const result = await gradeAt(grandma, SUNDAY);

    expect(result.complete).toBe(true);
    expect(result.week.weekNumber).toBe(2);
    // Grandma: Michigan locked (20) plus Ohio State (10). Jonah: Miami only.
    expect(result.scores.map((s) => [s.member.displayName, s.points, s.correct, s.incorrect, s.pending])).toEqual([
      ["Grandma", 30, 2, 0, 0],
      ["Jonah", 10, 1, 2, 0],
    ]);
    expect(result.scores[0].lockGameId).toBe(michigan.id);
    expect(result.scores[0].lockDropped).toBe(false);
    expect(result.scores[1].lockGameId).toBeNull();
    // Nobody guessed, and a missing guess counts as zero against Texas's 59.
    expect(result.scores.map((s) => [s.tiebreakerGuess, s.tiebreakerError])).toEqual([
      [null, 59],
      [null, 59],
    ]);
    expect(result.weeklyWin).toEqual({
      winners: [{ id: grandma.id, displayName: "Grandma", avatarId: null }],
      points: 30,
      decidedBy: "points",
    });
    // The same pass produced the board: the Reveal is not a second grading.
    expect(result.reveal.games.find((g) => g.game.id === michigan.id)!.picks.map((p) => p.outcome)).toEqual([
      "incorrect",
      "correct",
    ]);
    expect(result.reveal.members.map((m) => m.id)).toEqual([jonah.id, grandma.id]);
  });

  test("a week with a game still to play is not complete, and says how much is still pending", async () => {
    const { grandma, gradeAt, ingest } = await setup();
    await ingest(feedWith({ [OKLAHOMA_AT_MICHIGAN]: [24, 27] }), SATURDAY_EVENING);

    const result = await gradeAt(grandma, SATURDAY_EVENING);

    expect(result.complete).toBe(false);
    expect(result.scores.map((s) => [s.member.displayName, s.points, s.pending])).toEqual([
      ["Grandma", 20, 1],
      ["Jonah", 0, 2],
    ]);
    // The Tiebreaker Game has not finished, so there is nothing to measure a guess against yet.
    expect(result.scores.every((s) => s.tiebreakerError === null)).toBe(true);
  });

  test("a Dropped Lock is reported on the score, so a member is not read as having set none", async () => {
    const { db, jonah, week, texas, gradeAt, ingest } = await setup();
    await setLock(db, jonah, week.id, texas.id, THURSDAY);
    await ingest(feedWith(ALL_FINAL), SUNDAY);
    await voidGame(db, jonah, texas.id, "Postponed to December");

    const jonahScore = (await gradeAt(jonah, SUNDAY)).scores.find((s) => s.member.id === jonah.id)!;

    expect(jonahScore.lockGameId).toBe(texas.id);
    expect(jonahScore.lockDropped).toBe(true);
    // Miami alone, at single points: the Lock was released rather than doubled.
    expect(jonahScore.points).toBe(10);
  });
});

describe("the season leaderboard", () => {
  test("adds up the played weeks and ranks every member on the season tiebreaks", async () => {
    const { db, jonah, grandma, ingest } = await setup();
    await ingest(feedWith(ALL_FINAL), SUNDAY);

    const season = await seasonResult(db, grandma, SUNDAY);

    expect(season.season.year).toBe(2026);
    expect(season.weeks.map((w) => [w.week.weekNumber, w.complete])).toEqual([[2, true]]);
    expect(season.weeks[0].weeklyWin!.winners.map((m) => m.id)).toEqual([grandma.id]);
    expect(season.leaderboard).toEqual([
      {
        member: { id: grandma.id, displayName: "Grandma", avatarId: null },
        rank: 1,
        totalPoints: 30,
        correct: 2,
        incorrect: 0,
        weeklyWins: 1,
        weeksPlayed: 1,
        averagePoints: 30,
        cumulativeTiebreakerError: 59,
      },
      {
        member: { id: jonah.id, displayName: "Jonah", avatarId: null },
        rank: 2,
        totalPoints: 10,
        correct: 1,
        incorrect: 2,
        weeklyWins: 0,
        weeksPlayed: 1,
        averagePoints: 10,
        cumulativeTiebreakerError: 59,
      },
    ]);
  });

  test("a published week whose deadline has not passed is not a week played", async () => {
    const { db, grandma } = await setup();

    // Week 2 is published, but Thursday is inside it: counting it would score every member zero
    // for a week nobody has picked yet, and drag every average down with it.
    const season = await seasonResult(db, grandma, THURSDAY);

    expect(season.weeks).toEqual([]);
    // Everyone is still on the board at zero: an empty season is a table of zeroes, not an empty screen.
    expect(season.leaderboard.map((r) => [r.member.displayName, r.rank, r.totalPoints, r.weeksPlayed])).toEqual([
      ["Jonah", 1, 0, 0],
      ["Grandma", 1, 0, 0],
    ]);
    expect(season.leaderboard.every((r) => r.averagePoints === null)).toBe(true);
  });
});

describe("the results console", () => {
  test("composes the week the screen renders: the chooser, the rows, the log, and when the feed was last read", async () => {
    const { db, jonah, grandma, week, miami, michigan, texas, ingest } = await setup();
    const feed = feedWith({ [OKLAHOMA_AT_MICHIGAN]: [24, 27] }, { [OHIO_STATE_AT_TEXAS]: [3, 0] });
    await ingest(feed, SATURDAY_EVENING);
    await voidGame(db, jonah, miami.id, "Hurricane", SATURDAY_EVENING);

    const view = await resultsConsole(db, jonah, 2, SATURDAY_EVENING);

    expect(view.year).toBe(2026);
    expect(view.week).toEqual({ id: week.id, weekNumber: 2, published: true, tiebreakerGameId: texas.id });
    expect(view.weeks.map((w) => [w.weekNumber, w.published])).toEqual([[2, true]]);
    expect(view.feedCheckedAt).toEqual(SATURDAY_EVENING);

    // One row per Game in slate order, each the shared pair plus this table's own column.
    expect(view.rows.map((r) => r.game.id)).toEqual([miami.id, michigan.id, texas.id]);
    expect(view.rows.map((r) => [r.result.label, r.result.shown, r.review])).toEqual([
      ["Void", null, false],
      ["Final", { awayScore: 24, homeScore: 27 }, false],
      // The running score is what the table puts on screen; it is still not final.
      ["In progress", { awayScore: 3, homeScore: 0 }, false],
    ]);

    expect(view.log.map((e) => [e.kind, e.awayTeam, e.note])).toEqual([["void", miami.awayTeam, "Hurricane"]]);
    await expect(resultsConsole(db, grandma, 2, SATURDAY_EVENING)).rejects.toBeInstanceOf(NotCommissioner);
  });

  test("opens the week asked for, creating it, and falls back to the default week when none is", async () => {
    const { db, jonah, week } = await setup();

    // No `?week=`: the latest published week, which is the one the fixture published.
    expect((await resultsConsole(db, jonah, undefined, THURSDAY)).week.id).toBe(week.id);

    // Week 5 does not exist yet; visiting it creates it and the chooser lists it at once.
    const fresh = await resultsConsole(db, jonah, 5, THURSDAY);
    expect(fresh.week).toMatchObject({ weekNumber: 5, published: false, tiebreakerGameId: null });
    expect(fresh.weeks.map((w) => w.weekNumber)).toEqual([2, 5]);
    expect(fresh.rows).toEqual([]);
    expect(fresh.review).toBeNull();
    expect(fresh.feedCheckedAt).toBeNull();
  });

  test("the review notice counts the overdue games and says the hours out loud, plural and all", async () => {
    const { db, jonah, miami, michigan } = await setup();
    // Miami kicks off on Friday and Michigan on Saturday, so they come due in turn.
    const miamiDue = new Date(miami.kickoff.getTime() + REVIEW_AFTER_MS);
    const bothDue = new Date(michigan.kickoff.getTime() + REVIEW_AFTER_MS);

    // A game still inside its six hours has not earned the notice.
    expect(reviewNotice([miami, michigan], new Date(miamiDue.getTime() - 1))).toBeNull();

    expect(reviewNotice([miami, michigan], miamiDue)).toEqual({ count: 1, hours: 6, subject: "One game is" });
    expect(reviewNotice([miami, michigan], bothDue)).toEqual({ count: 2, hours: 6, subject: "2 games are" });

    // A Void is not something to chase: it is already decided. Texas has not
    // kicked off by then either, so voiding Miami leaves Michigan alone.
    await voidGame(db, jonah, miami.id, "Hurricane", bothDue);
    const notice = (await resultsConsole(db, jonah, 2, bothDue)).review;
    expect(notice).toEqual({ count: 1, hours: 6, subject: "One game is" });
  });
});
