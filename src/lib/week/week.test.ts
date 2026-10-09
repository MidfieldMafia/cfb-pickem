import { describe, expect, test } from "vitest";
import type { CfbdClient } from "@/lib/cfbd/types";
import { addGame, openWeek, publishSlate, setTiebreaker, slateFor } from "@/lib/slate/slate";
import {
  ALL_FINAL,
  FAMU_AT_MIAMI,
  familyGroup,
  feedWith,
  guessAs,
  lockAs,
  OKLAHOMA_AT_MICHIGAN,
  pickAs,
  publishWeek2,
  seedWeek2,
  SUNDAY,
  THURSDAY,
  TUESDAY,
  type Week2Fixture,
} from "@/test/week-2";
import type { Member } from "@/db/schema";
import type { Db } from "@/db/types";
import type { GradedWeekResult } from "@/lib/results/results";
import { currentWeek, landingRoute, scoredWeek, weekInReview, type ScoredWeek, type WeekOptions } from "./week";
import { ingestResults, voidGame } from "@/lib/results/writes";

/**
 * Every member these fixtures seed is in Mabry Family, so that is the board
 * they read. The group is threaded in here rather than at each call site
 * because none of these tests is about *which* group — they are about the
 * Week, the Reveal and the landing route, all of which behave the same on any
 * board. `groups/boards.test.ts` is where the choice of group is the subject.
 */
async function familyOf(db: Db): Promise<number> {
  return (await familyGroup(db)).id;
}

async function familyWeek(db: Db, actor: Member, now?: Date, options: WeekOptions = {}): Promise<ScoredWeek | null> {
  return scoredWeek(db, actor, await familyOf(db), now, options);
}

async function familyReview(db: Db, weekNumber: number | undefined, now?: Date, options: WeekOptions = {}) {
  return weekInReview(db, await familyOf(db), weekNumber, now, options);
}

/** A Week past its Deadline, graded on the family's board; anything else here is a test that asked for the wrong thing. */
function gradedOf(week: ScoredWeek | null): ScoredWeek & { result: GradedWeekResult } {
  if (!week?.result) throw new Error(`expected a graded Week, got ${week?.state ?? "none"}`);
  return week as ScoredWeek & { result: GradedWeekResult };
}

/** Michigan reported final. `calls` counts feed reads, so a test can prove the gate held. */
const feedWithMichiganFinal = () => feedWith({ [OKLAHOMA_AT_MICHIGAN]: [24, 27] });

const angryFeed = (): CfbdClient => {
  throw new Error("CFBD_API_KEY is not set; run `vercel env pull .env.local`.");
};

describe("the current week", () => {
  test("is null until a slate is published, whatever weeks exist", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    expect(await currentWeek(db, grandma, THURSDAY)).toBeNull();
    expect(await familyWeek(db, grandma, THURSDAY)).toBeNull();

    // An open but unpublished Week is still no Week for a member: one shape, not a throw.
    await openWeek(db, jonah, 2);
    expect(await currentWeek(db, grandma, THURSDAY)).toBeNull();
  });

  test("carries the published slate and the member's own sheet before the deadline", async () => {
    const { db, slate, grandma, week, michigan, texas } = await publishWeek2();
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    await lockAs(db, grandma, slate, michigan.id, THURSDAY);
    await guessAs(db, grandma, slate, 55, THURSDAY);

    const current = (await currentWeek(db, grandma, THURSDAY))!;
    expect(current.slate.week.id).toBe(week.id);
    expect(current.slate.games).toHaveLength(3);
    expect(current.sheet.locked).toBe(false);
    expect(current.sheet.picks.map((p) => p.gameId)).toEqual([michigan.id]);
    expect(current.sheet.lock).toEqual({ state: "counts", gameId: michigan.id });
    expect(current.sheet.tiebreakerGuess).toBe(55);
    expect(current.slate.week.tiebreakerGameId).toBe(texas.id);

    // The Reveal is never open before the Deadline, asked for or not.
    expect(current.state).toBe("open");
    const scored = (await familyWeek(db, grandma, THURSDAY))!;
    expect(scored.state).toBe("open");
    expect(scored.result).toBeNull();
  });

  test("grades the week after the deadline, and only for the screen that asks", async () => {
    const { db, slate, jonah, grandma, michigan } = await publishWeek2();
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    await pickAs(db, jonah, slate, michigan, michigan.awayTeamId, THURSDAY);

    // Locked, but nobody asked: grading costs a read per member, so it stays undone.
    const quiet = (await currentWeek(db, grandma, SUNDAY))!;
    expect(quiet.sheet.locked).toBe(true);
    expect(quiet.state).toBe("live");
    expect(quiet).not.toHaveProperty("result");

    const shown = gradedOf(await familyWeek(db, grandma, SUNDAY));
    expect(shown.result.reveal.members.map((m) => m.displayName)).toEqual(["Jonah", "Grandma"]);
    const michiganRow = shown.result.reveal.games.find((g) => g.game.id === michigan.id)!;
    expect(michiganRow.picks.map((p) => p.memberId).sort()).toEqual([jonah.id, grandma.id].sort());
  });

  test("pulls the feed before grading, so the reveal never shows the scores it walked in with", async () => {
    const { db, slate, grandma, michigan } = await publishWeek2();
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    const feed = feedWithMichiganFinal();

    const graded = gradedOf(await familyWeek(db, grandma, SUNDAY, { cfbd: () => feed }));
    expect(feed.calls).toBe(1);
    const michiganRow = graded.result.reveal.games.find((g) => g.game.id === michigan.id)!;
    expect(michiganRow.result).toEqual({
      phase: "final",
      awayScore: 24,
      homeScore: 27,
      source: "feed",
      live: null,
      shown: { awayScore: 24, homeScore: 27 },
      label: "Final",
      note: null,
      feedFinal: null,
    });
    expect(michiganRow.picks.map((p) => p.outcome)).toEqual(["correct"]);
    // The board and the Weekly Score come out of the same pass, over the same refreshed rows.
    expect(graded.result.scores.map((s) => [s.member.displayName, s.points])).toEqual([
      ["Grandma", 10],
      ["Jonah", 0],
    ]);
    // The Slate handed back is the refreshed one, not the rows the read started from.
    expect(graded.slate.games.find((g) => g.id === michigan.id)).toMatchObject({ status: "final", homeScore: 27 });

    // The stale gate still bounds it: a second visit inside the interval does not call again.
    await familyWeek(db, grandma, SUNDAY, { cfbd: () => feed });
    expect(feed.calls).toBe(1);
  });

  test("a feed that will not answer leaves the week readable with the scores it had", async () => {
    const { db, slate, grandma, michigan } = await publishWeek2();
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);

    const current = gradedOf(await familyWeek(db, grandma, SUNDAY, { cfbd: angryFeed }));
    expect(current.sheet.locked).toBe(true);
    expect(current.result.reveal.games.find((g) => g.game.id === michigan.id)!.result.phase).toBe("due");
  });
});

/**
 * A second published Week, so a test can look back past the latest one. The
 * recording is one week of games, and the schema's unique index is per Week
 * (`games_week_cfbd_idx`), so a later Week is those same games with its own
 * Deadline — enough for a chooser to have two entries.
 */
async function publishAlso(fixture: Week2Fixture, weekNumber: number) {
  const { db, jonah, candidate } = fixture;
  const week = await openWeek(db, jonah, weekNumber);
  await addGame(db, jonah, week.id, candidate(FAMU_AT_MIAMI));
  const michigan = await addGame(db, jonah, week.id, candidate(OKLAHOMA_AT_MICHIGAN));
  await setTiebreaker(db, jonah, week.id, michigan.id);
  await publishSlate(db, jonah, week.id, TUESDAY);
  return { week, michigan };
}

/** Grandma takes Michigan in the Week: someone in the family played it, so it has a Reveal (#332). */
async function playIn(fixture: Week2Fixture, weekId: number) {
  const { db, grandma } = fixture;
  const slate = await slateFor(db, weekId);
  const michigan = slate.games.find((g) => g.cfbdGameId === OKLAHOMA_AT_MICHIGAN)!;
  await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
}

describe("the week in review", () => {
  test("opens on the latest week the season has played, and offers every one of them", async () => {
    const fixture = await publishWeek2();
    const three = await publishAlso(fixture, 3);
    await playIn(fixture, fixture.week.id);
    await playIn(fixture, three.week.id);

    const review = (await familyReview(fixture.db,undefined, SUNDAY))!;

    expect(review.played).toEqual([2, 3]);
    expect(review.slate.week.id).toBe(three.week.id);
    // The Reveal and the scores come from the Week it landed on, not from the live one.
    expect(review.result.reveal.week.weekNumber).toBe(3);
  });

  test("looks back at an older week when asked, and falls back when asked for one the season has not played", async () => {
    const fixture = await publishWeek2();
    const three = await publishAlso(fixture, 3);
    await playIn(fixture, fixture.week.id);
    await playIn(fixture, three.week.id);
    const { db } = fixture;

    expect((await familyReview(db,2, SUNDAY))!.slate.week.weekNumber).toBe(2);
    // Week 9 does not exist, and week 1 was never published: both land on the latest played.
    expect((await familyReview(db,9, SUNDAY))!.slate.week.weekNumber).toBe(3);
    expect((await familyReview(db,1, SUNDAY))!.slate.week.weekNumber).toBe(3);
  });

  test("there is nothing to review until a deadline has passed", async () => {
    const fixture = await publishWeek2();
    const { db, jonah } = fixture;
    await playIn(fixture, fixture.week.id);

    // Thursday is inside Week 2: the Reveal is what the Deadline gates, so the
    // week is not reviewable yet — asked for by number or not.
    expect(await familyReview(db,undefined, THURSDAY)).toBeNull();
    expect(await familyReview(db,2, THURSDAY)).toBeNull();

    // An unpublished Week is not reviewable either, whatever the clock says:
    // asking for Week 4 lands on Week 2, the one the season has played.
    await openWeek(db, jonah, 4);
    expect((await familyReview(db,4, SUNDAY))!.slate.week.weekNumber).toBe(2);
  });

  test("offers only the Weeks someone in the group picked in (#332)", async () => {
    const fixture = await publishWeek2();
    const { db } = fixture;
    await publishAlso(fixture, 3);
    await playIn(fixture, fixture.week.id);

    // Week 3's Deadline has passed, but nobody in the family picked it: there is
    // nothing to reveal, so it is not offered and asking for it lands on Week 2.
    const review = (await familyReview(db, 3, SUNDAY))!;
    expect(review.played).toEqual([2]);
    expect(review.slate.week.weekNumber).toBe(2);
  });

  test("has nothing to review in a season nobody in the group has picked in", async () => {
    const { db } = await publishWeek2();

    expect(await familyReview(db, undefined, SUNDAY)).toBeNull();
  });

  test("grades the week it lands on, with everyone's picks on the board", async () => {
    const { db, slate, jonah, grandma, michigan, week } = await publishWeek2();
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY); // Michigan
    await lockAs(db, grandma, slate, michigan.id, THURSDAY);
    await pickAs(db, jonah, slate, michigan, michigan.awayTeamId, THURSDAY); // Oklahoma
    await ingestResults(db, feedWithMichiganFinal(), await slateFor(db, week.id), SUNDAY);

    const review = (await familyReview(db,2, SUNDAY))!;

    // Michigan won: Grandma's Lock doubles it, Jonah has nothing.
    expect(review.result.scores.map((s) => [s.member.displayName, s.points])).toEqual([
      ["Grandma", 20],
      ["Jonah", 0],
    ]);
    expect(review.result.complete).toBe(false);
    const michiganRow = review.result.reveal.games.find((g) => g.game.id === michigan.id)!;
    expect(michiganRow.picks.map((p) => [p.memberId, p.outcome, p.lock])).toEqual([
      [jonah.id, "incorrect", null],
      [grandma.id, "correct", "counts"],
    ]);
  });

  test("drives the feed on the same stale gate as the current week", async () => {
    const { db, slate, grandma, michigan } = await publishWeek2();
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    const feed = feedWithMichiganFinal();

    const review = (await familyReview(db,2, SUNDAY, { cfbd: () => feed }))!;

    expect(feed.calls).toBe(1);
    // Graded off the rows the pull left behind, not the ones the read started from.
    expect(review.result.reveal.games.find((g) => g.game.id === michigan.id)!.result.phase).toBe("final");
    expect(review.result.scores.find((s) => s.member.id === grandma.id)!.points).toBe(10);

    await familyReview(db,2, SUNDAY, { cfbd: () => feed });
    expect(feed.calls).toBe(1);
  });
});

describe("the landing route (#91's states)", () => {
  test("goes to the Leaderboard when no week is published", async () => {
    const { db, grandma } = await seedWeek2();
    expect(landingRoute(await currentWeek(db, grandma, THURSDAY))).toBe("/leaderboard");
  });

  test("goes to Picks before the deadline", async () => {
    const { db, grandma } = await publishWeek2();
    expect(landingRoute(await currentWeek(db, grandma, THURSDAY))).toBe("/picks");
  });

  test("goes to review once every Pick is in, Lock and Guess still to set", async () => {
    // The flow has no control for either, so a finished sheet lands on the
    // screen that does rather than at the top of a slate already decided.
    const { db, slate, grandma, miami, michigan, texas } = await publishWeek2();
    for (const game of [miami, michigan, texas]) {
      await pickAs(db, grandma, slate, game, game.homeTeamId, THURSDAY);
    }

    expect(landingRoute(await currentWeek(db, grandma, THURSDAY))).toBe("/picks/review");
  });

  test("one game still open keeps the member in the flow", async () => {
    const { db, slate, grandma, miami, michigan } = await publishWeek2();
    await pickAs(db, grandma, slate, miami, miami.homeTeamId, THURSDAY);
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);

    expect(landingRoute(await currentWeek(db, grandma, THURSDAY))).toBe("/picks");
  });

  test("a Void game the member never picked does not hold them in the flow", async () => {
    const { db, jonah, slate, grandma, miami, michigan, texas } = await publishWeek2();
    await pickAs(db, grandma, slate, miami, miami.homeTeamId, THURSDAY);
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    await voidGame(db, jonah, texas.id, "Hurricane");

    expect(landingRoute(await currentWeek(db, grandma, THURSDAY))).toBe("/picks/review");
  });

  test("goes to the Live Board once locked but still grading", async () => {
    const { db, week, slate, grandma, michigan } = await publishWeek2();
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    await ingestResults(db, feedWithMichiganFinal(), await slateFor(db, week.id), SUNDAY);

    expect(landingRoute(await currentWeek(db, grandma, SUNDAY))).toBe("/live");
  });

  test("goes to the Leaderboard once every non-void game is final", async () => {
    const { db, week, grandma } = await publishWeek2();
    await ingestResults(db, feedWith(ALL_FINAL), await slateFor(db, week.id), SUNDAY);

    expect(landingRoute(await currentWeek(db, grandma, SUNDAY))).toBe("/leaderboard");
  });

  test("a member in no group is told the Week has settled, with nothing graded", async () => {
    // Settled comes from the Games, not from a board, so the member lands on
    // the Leaderboard like anyone else, where the no-group screen also is.
    const { db, week, grandma } = await publishWeek2();
    await ingestResults(db, feedWith(ALL_FINAL), await slateFor(db, week.id), SUNDAY);

    const ungrouped = (await scoredWeek(db, grandma, null, SUNDAY))!;
    expect(ungrouped.state).toBe("settled");
    expect(ungrouped.result).toBeNull();
    expect(landingRoute(ungrouped)).toBe("/leaderboard");
  });

  test("a Void game does not hold the Week live", async () => {
    const { db, week, jonah, grandma, texas } = await publishWeek2();
    await ingestResults(
      db,
      feedWith({ [FAMU_AT_MIAMI]: ALL_FINAL[FAMU_AT_MIAMI], [OKLAHOMA_AT_MICHIGAN]: ALL_FINAL[OKLAHOMA_AT_MICHIGAN] }),
      await slateFor(db, week.id),
      SUNDAY,
    );
    expect((await currentWeek(db, grandma, SUNDAY))!.state).toBe("live");

    await voidGame(db, jonah, texas.id, "Hurricane");
    expect((await currentWeek(db, grandma, SUNDAY))!.state).toBe("settled");
  });
});
