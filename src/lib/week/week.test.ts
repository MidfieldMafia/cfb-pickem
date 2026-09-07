import { describe, expect, test } from "vitest";
import type { CfbdClient } from "@/lib/cfbd/types";
import { ingestResults } from "@/lib/results/results";
import { addGame, openWeek, publishSlate, setTiebreaker, slateFor } from "@/lib/slate/slate";
import {
  FAMU_AT_MIAMI,
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
import { currentWeek, weekInReview } from "./week";

/** Michigan reported final. `calls` counts feed reads, so a test can prove the gate held. */
const feedWithMichiganFinal = () => feedWith({ [OKLAHOMA_AT_MICHIGAN]: [24, 27] });

const angryFeed = (): CfbdClient => {
  throw new Error("CFBD_API_KEY is not set; run `vercel env pull .env.local`.");
};

describe("the current week", () => {
  test("is null until a slate is published, whatever weeks exist", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    expect(await currentWeek(db, grandma, THURSDAY)).toBeNull();

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
    expect(current.sheet.lockGameId).toBe(michigan.id);
    expect(current.sheet.tiebreakerGuess).toBe(55);
    expect(current.slate.week.tiebreakerGameId).toBe(texas.id);

    // The Reveal is never open before the Deadline, asked for or not.
    expect(current.result).toBeNull();
    expect((await currentWeek(db, grandma, THURSDAY, { graded: true }))!.result).toBeNull();
  });

  test("grades the week after the deadline, and only for the screen that asks", async () => {
    const { db, slate, jonah, grandma, michigan } = await publishWeek2();
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    await pickAs(db, jonah, slate, michigan, michigan.awayTeamId, THURSDAY);

    // Locked, but nobody asked: grading costs a read per member, so it stays undone.
    const quiet = (await currentWeek(db, grandma, SUNDAY))!;
    expect(quiet.sheet.locked).toBe(true);
    expect(quiet.result).toBeNull();

    const shown = (await currentWeek(db, grandma, SUNDAY, { graded: true }))!;
    expect(shown.result!.reveal.members.map((m) => m.displayName)).toEqual(["Jonah", "Grandma"]);
    const michiganRow = shown.result!.reveal.games.find((g) => g.game.id === michigan.id)!;
    expect(michiganRow.picks.map((p) => p.memberId).sort()).toEqual([jonah.id, grandma.id].sort());
  });

  test("pulls the feed before grading, so the reveal never shows the scores it walked in with", async () => {
    const { db, slate, grandma, michigan } = await publishWeek2();
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    const feed = feedWithMichiganFinal();

    const graded = (await currentWeek(db, grandma, SUNDAY, { graded: true, cfbd: () => feed }))!;
    expect(feed.calls).toBe(1);
    const michiganRow = graded.result!.reveal.games.find((g) => g.game.id === michigan.id)!;
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
    expect(michiganRow.picks.map((p) => p.outcome)).toEqual(["correct"]);
    // The board and the Weekly Score come out of the same pass, over the same refreshed rows.
    expect(graded.result!.scores.map((s) => [s.member.displayName, s.points])).toEqual([
      ["Grandma", 10],
      ["Jonah", 0],
    ]);
    // The Slate handed back is the refreshed one, not the rows the read started from.
    expect(graded.slate.games.find((g) => g.id === michigan.id)).toMatchObject({ status: "final", homeScore: 27 });

    // The stale gate still bounds it: a second visit inside the interval does not call again.
    await currentWeek(db, grandma, SUNDAY, { graded: true, cfbd: () => feed });
    expect(feed.calls).toBe(1);
  });

  test("a feed that will not answer leaves the week readable with the scores it had", async () => {
    const { db, slate, grandma, michigan } = await publishWeek2();
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);

    const current = (await currentWeek(db, grandma, SUNDAY, { graded: true, cfbd: angryFeed }))!;
    expect(current.sheet.locked).toBe(true);
    expect(current.result!.reveal.games.find((g) => g.game.id === michigan.id)!.result.status).toBe("pending");
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

describe("the week in review", () => {
  test("opens on the latest week the season has played, and offers every one of them", async () => {
    const fixture = await publishWeek2();
    const three = await publishAlso(fixture, 3);

    const review = (await weekInReview(fixture.db, fixture.grandma, undefined, SUNDAY))!;

    expect(review.played).toEqual([2, 3]);
    expect(review.slate.week.id).toBe(three.week.id);
    // The Reveal and the scores come from the Week it landed on, not from the live one.
    expect(review.result.reveal.week.weekNumber).toBe(3);
  });

  test("looks back at an older week when asked, and falls back when asked for one the season has not played", async () => {
    const fixture = await publishWeek2();
    await publishAlso(fixture, 3);
    const { db, grandma } = fixture;

    expect((await weekInReview(db, grandma, 2, SUNDAY))!.slate.week.weekNumber).toBe(2);
    // Week 9 does not exist, and week 1 was never published: both land on the latest played.
    expect((await weekInReview(db, grandma, 9, SUNDAY))!.slate.week.weekNumber).toBe(3);
    expect((await weekInReview(db, grandma, 1, SUNDAY))!.slate.week.weekNumber).toBe(3);
  });

  test("there is nothing to review until a deadline has passed", async () => {
    const { db, jonah, grandma } = await publishWeek2();

    // Thursday is inside Week 2: the Reveal is what the Deadline gates, so the
    // week is not reviewable yet — asked for by number or not.
    expect(await weekInReview(db, grandma, undefined, THURSDAY)).toBeNull();
    expect(await weekInReview(db, grandma, 2, THURSDAY)).toBeNull();

    // An unpublished Week is not reviewable either, whatever the clock says:
    // asking for Week 4 lands on Week 2, the one the season has played.
    await openWeek(db, jonah, 4);
    expect((await weekInReview(db, grandma, 4, SUNDAY))!.slate.week.weekNumber).toBe(2);
  });

  test("grades the week it lands on, with everyone's picks on the board", async () => {
    const { db, slate, jonah, grandma, michigan, week } = await publishWeek2();
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY); // Michigan
    await lockAs(db, grandma, slate, michigan.id, THURSDAY);
    await pickAs(db, jonah, slate, michigan, michigan.awayTeamId, THURSDAY); // Oklahoma
    await ingestResults(db, feedWithMichiganFinal(), await slateFor(db, week.id), SUNDAY);

    const review = (await weekInReview(db, grandma, 2, SUNDAY))!;

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

    const review = (await weekInReview(db, grandma, 2, SUNDAY, { cfbd: () => feed }))!;

    expect(feed.calls).toBe(1);
    // Graded off the rows the pull left behind, not the ones the read started from.
    expect(review.result.reveal.games.find((g) => g.game.id === michigan.id)!.result.status).toBe("final");
    expect(review.result.scores.find((s) => s.member.id === grandma.id)!.points).toBe(10);

    await weekInReview(db, grandma, 2, SUNDAY, { cfbd: () => feed });
    expect(feed.calls).toBe(1);
  });
});
