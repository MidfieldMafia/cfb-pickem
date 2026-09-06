import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { games, members, seasons, weeks } from "@/db/schema";
import { recordedCfbd, recordings } from "@/lib/cfbd/recorded";
import type { CfbdClient, CfbdGame } from "@/lib/cfbd/types";
import { weekCandidates } from "@/lib/cfbd/candidates";
import { addMember, bootstrapCommissioner, NotCommissioner } from "@/lib/members/members";
import { PicksHidden, savePick, setLock } from "@/lib/picks/picks";
import { addGame, openWeek, publishSlate, setTiebreaker, voidGame } from "@/lib/slate/slate";
import { createTestDb } from "@/test/db";
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
  revealFor,
} from "./results";

const OHIO_STATE_AT_TEXAS = 401856682; // Sat 2026-09-12 23:30Z
const OKLAHOMA_AT_MICHIGAN = 401856679; // Sat 2026-09-12 16:00Z
const FAMU_AT_MIAMI = 401858213; // Fri 2026-09-11 00:00Z, the earliest kickoff and so the Deadline
const TUESDAY = new Date("2026-09-08T18:00:00Z");
const THURSDAY = new Date("2026-09-10T20:00:00Z");
const SATURDAY_EVENING = new Date("2026-09-12T20:00:00Z"); // Michigan is over, Texas has not kicked off
const SUNDAY = new Date("2026-09-13T12:00:00Z");

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

/** A published Week 2 slate of three games, Texas as the Tiebreaker Game, with Grandma's and Jonah's picks in. */
async function setup() {
  const db = await createTestDb();
  await db.insert(seasons).values({ year: 2026, rules: { pointsPerCorrectPick: 10, lockMultiplier: 2 }, active: true });
  const jonah = await bootstrapCommissioner(db, { displayName: "Jonah" });
  const grandma = await addMember(db, jonah, { displayName: "Grandma" });
  // Pin the join dates before the Deadline so the test does not depend on the wall clock.
  await db.update(members).set({ joinedAt: TUESDAY });
  const candidates = await weekCandidates(recordedCfbd("2026-week-2"), { year: 2026, week: 2 });
  const candidate = (id: number) => candidates.find((c) => c.cfbdGameId === id)!;
  const week = await openWeek(db, jonah, 2);
  const miami = await addGame(db, jonah, week.id, candidate(FAMU_AT_MIAMI));
  const michigan = await addGame(db, jonah, week.id, candidate(OKLAHOMA_AT_MICHIGAN));
  const texas = await addGame(db, jonah, week.id, candidate(OHIO_STATE_AT_TEXAS));
  await setTiebreaker(db, jonah, week.id, texas.id);
  const slate = await publishSlate(db, jonah, week.id, TUESDAY);

  await savePick(db, grandma, week.id, michigan.id, michigan.homeTeamId, THURSDAY); // Michigan
  await savePick(db, grandma, week.id, texas.id, texas.awayTeamId, THURSDAY); // Ohio State
  await setLock(db, grandma, week.id, michigan.id, THURSDAY);
  await savePick(db, jonah, week.id, michigan.id, michigan.awayTeamId, THURSDAY); // Oklahoma
  await savePick(db, jonah, week.id, texas.id, texas.homeTeamId, THURSDAY); // Texas
  await savePick(db, jonah, week.id, miami.id, miami.homeTeamId, THURSDAY); // Miami

  const reload = async (gameId: number) => (await db.query.games.findFirst({ where: eq(games.id, gameId) }))!;
  return { db, jonah, grandma, week, miami, michigan, texas, deadline: slate.deadline!, reload };
}

describe("results ingest", () => {
  test("pulls final scores for the week's games, marks them final, and is safe to run again", async () => {
    const { db, week, miami, michigan, texas, reload } = await setup();
    const feed = feedWith({ [FAMU_AT_MIAMI]: [7, 45], [OKLAHOMA_AT_MICHIGAN]: [24, 27] }, { [OHIO_STATE_AT_TEXAS]: [3, 0] });

    expect(await ingestResults(db, feed, week.id, SATURDAY_EVENING)).toEqual({ changed: 3 });

    expect(await reload(miami.id)).toMatchObject({ status: "final", awayScore: 7, homeScore: 45 });
    expect(await reload(michigan.id)).toMatchObject({ status: "final", awayScore: 24, homeScore: 27 });
    // Not completed but scoring: in progress, with the running score, never final.
    expect(await reload(texas.id)).toMatchObject({ status: "in_progress", awayScore: 3, homeScore: 0 });
    expect((await db.query.weeks.findFirst({ where: eq(weeks.id, week.id) }))!.scoreboardFetchedAt).toEqual(
      SATURDAY_EVENING,
    );

    // The same feed again changes nothing; a later feed changes only what moved.
    expect(await ingestResults(db, feed, week.id, SUNDAY)).toEqual({ changed: 0 });
    const later = feedWith({ [FAMU_AT_MIAMI]: [7, 45], [OKLAHOMA_AT_MICHIGAN]: [24, 27], [OHIO_STATE_AT_TEXAS]: [31, 28] });
    expect(await ingestResults(db, later, week.id, SUNDAY)).toEqual({ changed: 1 });
    expect(await reload(texas.id)).toMatchObject({ status: "final", awayScore: 31, homeScore: 28 });
  });

  test("a game the feed never completes stays pending and is flagged for review hours after kickoff", async () => {
    const { db, week, texas, michigan, reload } = await setup();
    await ingestResults(db, feedWith({ [OKLAHOMA_AT_MICHIGAN]: [24, 27] }), week.id, SUNDAY);

    const pending = await reload(texas.id);
    expect(effectiveResult(pending)).toEqual({ status: "pending", homeScore: null, awayScore: null, source: null });
    expect(needsReview(pending, SATURDAY_EVENING)).toBe(false); // it has not kicked off yet
    expect(needsReview(pending, new Date("2026-09-13T03:00:00Z"))).toBe(false); // 3.5 hours in: could still be playing
    expect(needsReview(pending, SUNDAY)).toBe(true); // 12.5 hours later with no final: postponed or the feed is stuck
    expect(needsReview(await reload(michigan.id), SUNDAY)).toBe(false); // final games never need review
  });

  test("the stale gate calls the feed only when a pending game has kicked off, at most every five minutes", async () => {
    const { db, jonah, week, michigan, texas, reload } = await setup();
    const quiet = feedWith({});

    // Nothing has kicked off: no call.
    expect(await refreshResultsIfStale(db, quiet, week.id, THURSDAY)).toBe("idle");
    expect(quiet.calls).toBe(0);

    // Miami is past kickoff and not final: one call, then none for five minutes.
    const friday = new Date("2026-09-11T01:00:00Z");
    expect(await refreshResultsIfStale(db, quiet, week.id, friday)).toBe("refreshed");
    expect(await refreshResultsIfStale(db, quiet, week.id, new Date(friday.getTime() + 4 * 60_000))).toBe("fresh");
    expect(quiet.calls).toBe(1);
    expect(await refreshResultsIfStale(db, quiet, week.id, new Date(friday.getTime() + 5 * 60_000))).toBe("refreshed");
    expect(quiet.calls).toBe(2);

    // Once every kicked-off game is final (Texas has not started), the gate goes idle without a call.
    const finals = feedWith({ [FAMU_AT_MIAMI]: [7, 45], [OKLAHOMA_AT_MICHIGAN]: [24, 27] });
    expect(await refreshResultsIfStale(db, finals, week.id, SATURDAY_EVENING)).toBe("refreshed");
    expect(await reload(michigan.id)).toMatchObject({ status: "final" });
    expect(await refreshResultsIfStale(db, finals, week.id, new Date(SATURDAY_EVENING.getTime() + 6 * 60_000))).toBe("idle");
    expect(finals.calls).toBe(1);

    // A void game does not keep the feed polling; an override that makes a game final does not either.
    await voidGame(db, jonah, texas.id, "Hurricane");
    expect(await refreshResultsIfStale(db, finals, week.id, SUNDAY)).toBe("idle");
    await restoreGame(db, jonah, texas.id);
    await overrideResult(db, jonah, texas.id, { awayScore: 31, homeScore: 28, note: "Feed stuck" });
    expect(await refreshResultsIfStale(db, finals, week.id, SUNDAY)).toBe("idle");
    expect(finals.calls).toBe(1);
  });
});

describe("result overrides", () => {
  test("a commissioner's override beats the feed, is logged, and can be cleared back to the feed", async () => {
    const { db, jonah, grandma, week, michigan, texas, reload } = await setup();
    const feed = feedWith({ [OKLAHOMA_AT_MICHIGAN]: [24, 27] });
    await ingestResults(db, feed, week.id, SATURDAY_EVENING);

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
    expect(effectiveResult(game)).toEqual({ status: "final", awayScore: 30, homeScore: 27, source: "override" });
    // The feed columns stay what the feed said, and a re-ingest does not disturb the override.
    expect(game).toMatchObject({ awayScore: 24, homeScore: 27, overrideAwayScore: 30, overrideHomeScore: 27 });
    await ingestResults(db, feed, week.id, SUNDAY);
    expect(effectiveResult(await reload(michigan.id))).toMatchObject({ awayScore: 30, source: "override" });

    // An override on a game the feed has not finished makes it final on its own.
    await overrideResult(db, jonah, texas.id, { awayScore: 31, homeScore: 28, note: "Feed stuck on Sunday" });
    expect(effectiveResult(await reload(texas.id))).toEqual({ status: "final", awayScore: 31, homeScore: 28, source: "override" });

    await clearOverride(db, jonah, michigan.id);
    game = await reload(michigan.id);
    expect(effectiveResult(game)).toEqual({ status: "final", awayScore: 24, homeScore: 27, source: "feed" });
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
    const { db, jonah, week, michigan, reload } = await setup();
    await ingestResults(db, feedWith({ [OKLAHOMA_AT_MICHIGAN]: [24, 27] }), week.id, SATURDAY_EVENING);

    await voidGame(db, jonah, michigan.id, "Lightning; never resumed");
    expect(effectiveResult(await reload(michigan.id))).toEqual({ status: "void", homeScore: null, awayScore: null, source: null });
    await expect(overrideResult(db, jonah, michigan.id, { awayScore: 24, homeScore: 27, note: "n" })).rejects.toThrow(
      /void/i,
    );
    await expect(restoreGame(db, jonah, 9999)).rejects.toThrow(InvalidResult); // no such game

    const restored = await restoreGame(db, jonah, michigan.id);
    expect(restored).toMatchObject({ void: false, voidNote: null });
    expect(effectiveResult(restored)).toEqual({ status: "final", awayScore: 24, homeScore: 27, source: "feed" });
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
    const { db, jonah, grandma, week, miami, michigan, texas, deadline } = await setup();
    await ingestResults(db, feedWith({ [OKLAHOMA_AT_MICHIGAN]: [24, 27] }), week.id, SATURDAY_EVENING);

    await expect(revealFor(db, grandma, week.id, new Date(deadline.getTime() - 1))).rejects.toThrow(PicksHidden);
    await expect(revealFor(db, jonah, week.id, THURSDAY)).rejects.toThrow(PicksHidden);

    const reveal = await revealFor(db, grandma, week.id, SATURDAY_EVENING);
    expect(reveal.members.map((m) => m.displayName)).toEqual(["Jonah", "Grandma"]);
    expect(reveal.games.map((g) => g.game.id)).toEqual([miami.id, michigan.id, texas.id]);

    const [miamiRow, michiganRow, texasRow] = reveal.games;
    // A final game grades each pick; an unpicked game leaves the member off the game.
    expect(michiganRow.result).toEqual({ status: "final", awayScore: 24, homeScore: 27, source: "feed" });
    expect(michiganRow.picks).toEqual([
      { memberId: jonah.id, teamId: michigan.awayTeamId, outcome: "incorrect", locked: false },
      { memberId: grandma.id, teamId: michigan.homeTeamId, outcome: "correct", locked: true },
    ]);
    // A pending game shows the picks without a grade.
    expect(texasRow.result.status).toBe("pending");
    expect(texasRow.picks.map((p) => [p.memberId, p.outcome])).toEqual([
      [jonah.id, "pending"],
      [grandma.id, "pending"],
    ]);
    expect(miamiRow.picks).toEqual([{ memberId: jonah.id, teamId: miami.homeTeamId, outcome: "pending", locked: false }]);
  });

  test("a void game shows picks as void and an override regrades on the next read", async () => {
    const { db, jonah, grandma, week, michigan, texas } = await setup();
    await ingestResults(db, feedWith({ [OKLAHOMA_AT_MICHIGAN]: [24, 27] }), week.id, SATURDAY_EVENING);
    await voidGame(db, jonah, texas.id, "Postponed to December");
    await overrideResult(db, jonah, michigan.id, { awayScore: 30, homeScore: 27, note: "Feed missed the late FG" });

    const reveal = await revealFor(db, jonah, week.id, SUNDAY);
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
});
