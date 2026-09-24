import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { games } from "@/db/schema";
import type { Db } from "@/db/types";
import type { CfbdClient } from "@/lib/cfbd/types";
import { PicksHidden } from "@/lib/picks/picks";
import { slateFor } from "@/lib/slate/slate";
import {
  FAMU_AT_MIAMI,
  familyGroup,
  feedWith,
  type Finals,
  joinAt,
  lockAs,
  pickAs,
  OHIO_STATE_AT_TEXAS,
  OKLAHOMA_AT_MICHIGAN,
  publishWeek2,
  SATURDAY_EVENING,
  SUNDAY,
  THURSDAY,
  TUESDAY,
} from "@/test/week-2";
import { resultsConsole, REVIEW_AFTER_MS, reviewNotice, seasonResult, weekResult } from "./results";
import { clearOverride, ingestResults, overrideResult, refreshResultsIfStale, voidGame } from "./writes";

/**
 * The shared published Week 2 with Grandma's and Jonah's picks in. The Reveal
 * and the stale gate in front of it take the Week as loaded rows, so each reader
 * re-reads the Slate: a void, an override, or an ingest in the middle of a
 * test moves it.
 */
/**
 * The season as Mabry Family reads it. Every member the fixture seeds is in
 * that group, so the family's board is the same set of people this suite read
 * before boards were group-scoped — which is what keeps the numbers below the
 * hand-verified ones they have always been.
 */
async function seasonForFamily(db: Db, at: Date) {
  return seasonResult(db, (await familyGroup(db)).id, at);
}

async function setup() {
  const fixture = await publishWeek2();
  const { db, slate, jonah, grandma, week, miami, michigan, texas } = fixture;
  const family = await familyGroup(db);

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
    family,
    gradeAt: async (at: Date) => weekResult(db, family.id, await slateFor(db, week.id), at),
    revealAt: async (at: Date) => (await weekResult(db, family.id, await slateFor(db, week.id), at)).reveal,
  };
}

describe("the reveal", () => {
  test("is refused before the deadline and shows every member's pick per game, graded once the game is final", async () => {
    const { jonah, grandma, miami, michigan, texas, deadline, ingest, revealAt } = await setup();
    await ingest(feedWith({ [OKLAHOMA_AT_MICHIGAN]: [24, 27] }), SATURDAY_EVENING);

    await expect(revealAt(new Date(deadline.getTime() - 1))).rejects.toThrow(PicksHidden);
    await expect(revealAt(THURSDAY)).rejects.toThrow(PicksHidden);

    const reveal = await revealAt(SATURDAY_EVENING);
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
      { memberId: jonah.id, teamId: michigan.awayTeamId, outcome: "incorrect", lock: null, points: 0 },
      { memberId: grandma.id, teamId: michigan.homeTeamId, outcome: "correct", lock: "counts", points: 20 },
    ]);
    // A pending game shows the picks without a grade.
    expect(texasRow.result.status).toBe("pending");
    expect(texasRow.picks.map((p) => [p.memberId, p.outcome])).toEqual([
      [jonah.id, "pending"],
      [grandma.id, "pending"],
    ]);
    expect(miamiRow.picks).toEqual([
      { memberId: jonah.id, teamId: miami.homeTeamId, outcome: "pending", lock: null, points: 0 },
    ]);
  });

  test("a void game shows picks as void and an override regrades on the next read", async () => {
    const { db, jonah, grandma, michigan, texas, ingest, revealAt } = await setup();
    await ingest(feedWith({ [OKLAHOMA_AT_MICHIGAN]: [24, 27] }), SATURDAY_EVENING);
    await voidGame(db, jonah, texas.id, "Postponed to December");
    await overrideResult(db, jonah, michigan.id, { awayScore: 30, homeScore: 27, note: "Feed missed the late FG" });

    const reveal = await revealAt(SUNDAY);
    const michiganRow = reveal.games.find((g) => g.game.id === michigan.id)!;
    expect(michiganRow.result).toMatchObject({ awayScore: 30, source: "override" });
    expect(michiganRow.picks.map((p) => [p.memberId, p.outcome, p.lock])).toEqual([
      [jonah.id, "correct", null],
      [grandma.id, "incorrect", "counts"],
    ]);
    const texasRow = reveal.games.find((g) => g.game.id === texas.id)!;
    expect(texasRow.result.status).toBe("void");
    expect(texasRow.picks.map((p) => p.outcome)).toEqual(["void", "void"]);
  });

  test("a Dropped Lock stays on the board, so its owner is not mistaken for a member who set none", async () => {
    const { db, slate, jonah, grandma, michigan, texas, ingest, revealAt } = await setup();
    await lockAs(db, jonah, slate, texas.id, THURSDAY);
    await ingest(feedWith({ [OKLAHOMA_AT_MICHIGAN]: [24, 27] }), SATURDAY_EVENING);
    await voidGame(db, jonah, texas.id, "Postponed to December");

    const reveal = await revealAt(SUNDAY);

    // Jonah spent his Lock on the game that was voided. It scores nothing, but the board still shows he spent it.
    const texasRow = reveal.games.find((g) => g.game.id === texas.id)!;
    expect(texasRow.picks.map((p) => [p.memberId, p.lock])).toEqual([
      [jonah.id, "dropped"],
      [grandma.id, null],
    ]);

    // Grandma's Lock sits on a live game, so the Void leaves it counting.
    const michiganRow = reveal.games.find((g) => g.game.id === michigan.id)!;
    expect(michiganRow.picks.map((p) => [p.memberId, p.lock])).toEqual([
      [jonah.id, null],
      [grandma.id, "counts"],
    ]);

    // The one field cannot say both at once, which is what `RevealPick.lock` is for:
    // the exclusion used to rest on `score-week` setting `locked: false` in its void
    // branch, three modules from the board that promised it.
    const every = reveal.games.flatMap((g) => g.picks.map((p) => p.lock));
    expect(every.filter((lock) => lock === "dropped")).toHaveLength(1);
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

    const result = await gradeAt(SUNDAY);

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
    const { gradeAt, ingest } = await setup();
    await ingest(feedWith({ [OKLAHOMA_AT_MICHIGAN]: [24, 27] }), SATURDAY_EVENING);

    const result = await gradeAt(SATURDAY_EVENING);

    expect(result.complete).toBe(false);
    expect(result.scores.map((s) => [s.member.displayName, s.points, s.pending])).toEqual([
      ["Grandma", 20, 1],
      ["Jonah", 0, 2],
    ]);
    // The Tiebreaker Game has not finished, so there is nothing to measure a guess against yet.
    expect(result.scores.every((s) => s.tiebreakerError === null)).toBe(true);
  });

  test("a Dropped Lock is reported on the score, so a member is not read as having set none", async () => {
    const { db, slate, jonah, texas, gradeAt, ingest } = await setup();
    await lockAs(db, jonah, slate, texas.id, THURSDAY);
    await ingest(feedWith(ALL_FINAL), SUNDAY);
    await voidGame(db, jonah, texas.id, "Postponed to December");

    const jonahScore = (await gradeAt(SUNDAY)).scores.find((s) => s.member.id === jonah.id)!;

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

    const season = await seasonForFamily(db, SUNDAY);

    expect(season.season.year).toBe(2026);
    expect(season.weeks.map((w) => [w.week.weekNumber, w.complete])).toEqual([[2, true]]);
    expect(season.weeks[0].weeklyWin!.winners.map((m) => m.id)).toEqual([grandma.id]);
    expect(season.leaderboard).toEqual([
      {
        member: { id: grandma.id, displayName: "Grandma", avatarId: null },
        rank: 1,
        // Week 2 is the only played week, so there is no earlier board to have moved from.
        previousRank: null,
        totalPoints: 30,
        correct: 2,
        incorrect: 0,
        weeklyWins: 1,
        weeksPlayed: 1,
        averagePoints: 30,
        cumulativeTiebreakerError: 59,
        // Nobody guessed this week, so there is no guess to average.
        averageTiebreakerMiss: null,
      },
      {
        member: { id: jonah.id, displayName: "Jonah", avatarId: null },
        rank: 2,
        previousRank: null,
        totalPoints: 10,
        correct: 1,
        incorrect: 2,
        weeklyWins: 0,
        weeksPlayed: 1,
        averagePoints: 10,
        cumulativeTiebreakerError: 59,
        averageTiebreakerMiss: null,
      },
    ]);
  });

  test("a corrected result changes the standings on the next read, because no total is stored", async () => {
    const { db, jonah, michigan, ingest } = await setup();
    await ingest(feedWith(ALL_FINAL), SUNDAY);

    expect((await seasonForFamily(db, SUNDAY)).leaderboard.map((r) => [r.member.displayName, r.rank, r.totalPoints])).toEqual([
      ["Grandma", 1, 30],
      ["Jonah", 2, 10],
    ]);

    // The feed had Michigan winning 27–24. A commissioner corrects it to Oklahoma,
    // which is the game Grandma spent her Lock of the Week on.
    await overrideResult(
      db,
      jonah,
      michigan.id,
      { homeScore: 24, awayScore: 30, note: "Feed had the teams the wrong way round" },
      SUNDAY,
    );

    const after = await seasonForFamily(db, SUNDAY);
    // Grandma loses a doubled 20 and keeps Ohio State; Jonah's Oklahoma is now right.
    expect(after.leaderboard.map((r) => [r.member.displayName, r.rank, r.totalPoints, r.correct, r.incorrect])).toEqual([
      ["Jonah", 1, 20, 2, 1],
      ["Grandma", 2, 10, 1, 1],
    ]);
    // The Weekly Win moves with the points, and it is the same one week behind the season.
    expect(after.weeks[0].weeklyWin!.winners.map((m) => m.displayName)).toEqual(["Jonah"]);
    expect(after.leaderboard.map((r) => [r.member.displayName, r.weeklyWins])).toEqual([
      ["Jonah", 1],
      ["Grandma", 0],
    ]);

    // Clearing the override hands the week back to the feed, and the standings with it:
    // proof that nothing was written down on the way through.
    await clearOverride(db, jonah, michigan.id, SUNDAY);
    expect((await seasonForFamily(db, SUNDAY)).leaderboard.map((r) => [r.member.displayName, r.rank, r.totalPoints])).toEqual([
      ["Grandma", 1, 30],
      ["Jonah", 2, 10],
    ]);
  });

  test("a void changes the standings the same way, and drops the lock that sat on it", async () => {
    const { db, jonah, michigan, ingest } = await setup();
    await ingest(feedWith(ALL_FINAL), SUNDAY);

    await voidGame(db, jonah, michigan.id, "Called at halftime, lightning");

    const after = await seasonForFamily(db, SUNDAY);
    // Grandma's 20 was a Dropped Lock's worth: the game scores zero for everyone,
    // so she is left with Ohio State and Jonah with Miami — level, and level on
    // tiebreaker error too, since neither of them guessed.
    expect(after.leaderboard.map((r) => [r.member.displayName, r.rank, r.totalPoints])).toEqual([
      ["Jonah", 1, 10],
      ["Grandma", 1, 10],
    ]);
    // Nothing separates them, so the week is shared rather than handed to a read order.
    expect(after.weeks[0].weeklyWin!.decidedBy).toBe("shared");
    expect(after.leaderboard.every((r) => r.weeklyWins === 1)).toBe(true);
  });

  test("a published week whose deadline has not passed is not a week played", async () => {
    const { db } = await setup();

    // Week 2 is published, but Thursday is inside it: counting it would score every member zero
    // for a week nobody has picked yet, and drag every average down with it.
    const season = await seasonForFamily(db, THURSDAY);

    expect(season.weeks).toEqual([]);
    // Everyone is still on the board at zero: an empty season is a table of zeroes, not an empty screen.
    expect(season.leaderboard.map((r) => [r.member.displayName, r.rank, r.totalPoints, r.weeksPlayed])).toEqual([
      ["Jonah", 1, 0, 0],
      ["Grandma", 1, 0, 0],
    ]);
    expect(season.leaderboard.every((r) => r.averagePoints === null)).toBe(true);
  });

  test("a member who picked nothing sits the week out and keeps a Leaderboard row of dashes", async () => {
    const { db, jonah, ingest } = await setup();
    // Quiet joined well before the Deadline and never picked: on the roster all
    // week, and on none of the week's own screens.
    const quiet = await joinAt(db, jonah, "Quiet", TUESDAY);
    await ingest(feedWith(ALL_FINAL), SUNDAY);

    const season = await seasonForFamily(db, SUNDAY);

    // Everyone who joined in time is on the week's board, Quiet included: a
    // 0-0 row at zero points, sorted last, and marked as not a Played Week.
    // That count is also the "of" a place is read against on the week screen.
    expect(season.weeks[0].scores.map((s) => [s.member.displayName, s.played, s.points, s.correct, s.incorrect])).toEqual([
      ["Grandma", true, 30, 2, 0],
      ["Jonah", true, 10, 1, 2],
      ["Quiet", false, 0, 0, 0],
    ]);
    // Sitting the week out is not a share of it.
    expect(season.weeks[0].weeklyWin!.winners.map((m) => m.displayName)).toEqual(["Grandma"]);

    // Still on the Leaderboard: sitting a week out is not being dropped from the
    // season, which is the whole difference between this and a deactivation.
    expect(season.leaderboard.map((r) => r.member.displayName)).toEqual(["Grandma", "Jonah", "Quiet"]);
    expect(season.leaderboard.find((r) => r.member.id === quiet.id)).toMatchObject({
      rank: 3,
      totalPoints: 0,
      correct: 0,
      incorrect: 0,
      weeklyWins: 0,
      weeksPlayed: 0,
      // Null is what the board renders as an em dash. A 0 average would read as
      // a member who played and scored nothing, which is a different story.
      averagePoints: null,
      averageTiebreakerMiss: null,
      cumulativeTiebreakerError: 0,
    });
  });
});

describe("the results console", () => {
  test("composes the week the screen renders: the chooser, the rows, the log, and when the feed was last read", async () => {
    const { db, jonah, week, miami, michigan, texas, refresh } = await setup();
    const feed = feedWith({ [OKLAHOMA_AT_MICHIGAN]: [24, 27] }, { [OHIO_STATE_AT_TEXAS]: [3, 0] });
    // Through the stale gate, the way member traffic does it: `feedCheckedAt`
    // is that gate's claim, and a commissioner's own feed check no longer
    // stamps it, so an `ingest` here would leave the column null.
    expect(await refresh(feed, SATURDAY_EVENING)).toBe("refreshed");
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
    // `resultsConsole` takes a `Commissioner`, so a member calling it is a
    // type error here rather than a rejection — see `authority.ts`.
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
