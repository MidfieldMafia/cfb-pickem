import { describe, expect, test } from "vitest";
import type { CfbdClient } from "@/lib/cfbd/types";
import { ingestResults } from "@/lib/results/results";
import { addGame, openWeek, publishSlate, setTiebreaker, slateFor, voidGame } from "@/lib/slate/slate";
import {
  FAMU_AT_MIAMI,
  familyGroup,
  feedWith,
  type Finals,
  guessAs,
  lockAs,
  OHIO_STATE_AT_TEXAS,
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
import {
  currentWeek,
  landingRoute,
  weekInReview,
  type GradedWeekContext,
  type LiveWeek,
  type SettledWeek,
  type WeekContext,
  type WeekOptions,
} from "./week";

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

function familyWeek(db: Db, actor: Member, now: Date | undefined, options: WeekOptions & { graded: true }): Promise<GradedWeekContext | null>;
function familyWeek(db: Db, actor: Member, now?: Date, options?: WeekOptions): Promise<WeekContext | null>;
async function familyWeek(db: Db, actor: Member, now?: Date, options: WeekOptions = {}) {
  return currentWeek(
    db,
    actor,
    now,
    { ...options, group: await familyOf(db) },
  );
}

async function familyReview(
  db: Db,
  weekNumber: number | undefined,
  now?: Date,
  options: Pick<WeekOptions, "cfbd"> = {},
) {
  return weekInReview(
    db,
    weekNumber,
    now,
    { ...options, group: await familyOf(db) },
  );
}

/** The graded states carry a Reveal; anything else here is a test that asked for the wrong thing. */
function gradedOf(week: WeekContext | null): LiveWeek | SettledWeek {
  if (week?.state !== "live" && week?.state !== "settled") throw new Error(`expected a graded Week, got ${week?.state ?? "none"}`);
  return week;
}

/** Michigan reported final. `calls` counts feed reads, so a test can prove the gate held. */
const feedWithMichiganFinal = () => feedWith({ [OKLAHOMA_AT_MICHIGAN]: [24, 27] });

const angryFeed = (): CfbdClient => {
  throw new Error("CFBD_API_KEY is not set; run `vercel env pull .env.local`.");
};

describe("the current week", () => {
  test("is null until a slate is published, whatever weeks exist", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    expect(await familyWeek(db,grandma, THURSDAY)).toBeNull();

    // An open but unpublished Week is still no Week for a member: one shape, not a throw.
    await openWeek(db, jonah, 2);
    expect(await familyWeek(db,grandma, THURSDAY)).toBeNull();
  });

  test("carries the published slate and the member's own sheet before the deadline", async () => {
    const { db, slate, grandma, week, michigan, texas } = await publishWeek2();
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    await lockAs(db, grandma, slate, michigan.id, THURSDAY);
    await guessAs(db, grandma, slate, 55, THURSDAY);

    const current = (await familyWeek(db,grandma, THURSDAY))!;
    expect(current.slate.week.id).toBe(week.id);
    expect(current.slate.games).toHaveLength(3);
    expect(current.sheet.locked).toBe(false);
    expect(current.sheet.picks.map((p) => p.gameId)).toEqual([michigan.id]);
    expect(current.sheet.lockGameId).toBe(michigan.id);
    expect(current.sheet.tiebreakerGuess).toBe(55);
    expect(current.slate.week.tiebreakerGameId).toBe(texas.id);

    // The Reveal is never open before the Deadline, asked for or not.
    expect(current.state).toBe("open");
    expect((await familyWeek(db,grandma, THURSDAY, { graded: true }))!.state).toBe("open");
  });

  test("grades the week after the deadline, and only for the screen that asks", async () => {
    const { db, slate, jonah, grandma, michigan } = await publishWeek2();
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    await pickAs(db, jonah, slate, michigan, michigan.awayTeamId, THURSDAY);

    // Locked, but nobody asked: grading costs a read per member, so it stays undone.
    const quiet = (await familyWeek(db,grandma, SUNDAY))!;
    expect(quiet.sheet.locked).toBe(true);
    expect(quiet.state).toBe("locked");

    const shown = gradedOf(await familyWeek(db,grandma, SUNDAY, { graded: true }));
    expect(shown.result.reveal.members.map((m) => m.displayName)).toEqual(["Jonah", "Grandma"]);
    const michiganRow = shown.result.reveal.games.find((g) => g.game.id === michigan.id)!;
    expect(michiganRow.picks.map((p) => p.memberId).sort()).toEqual([jonah.id, grandma.id].sort());
  });

  test("pulls the feed before grading, so the reveal never shows the scores it walked in with", async () => {
    const { db, slate, grandma, michigan } = await publishWeek2();
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    const feed = feedWithMichiganFinal();

    const graded = gradedOf(await familyWeek(db,grandma, SUNDAY, { graded: true, cfbd: () => feed }));
    expect(feed.calls).toBe(1);
    const michiganRow = graded.result.reveal.games.find((g) => g.game.id === michigan.id)!;
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
    expect(graded.result.scores.map((s) => [s.member.displayName, s.points])).toEqual([
      ["Grandma", 10],
      ["Jonah", 0],
    ]);
    // The Slate handed back is the refreshed one, not the rows the read started from.
    expect(graded.slate.games.find((g) => g.id === michigan.id)).toMatchObject({ status: "final", homeScore: 27 });

    // The stale gate still bounds it: a second visit inside the interval does not call again.
    await familyWeek(db,grandma, SUNDAY, { graded: true, cfbd: () => feed });
    expect(feed.calls).toBe(1);
  });

  test("a feed that will not answer leaves the week readable with the scores it had", async () => {
    const { db, slate, grandma, michigan } = await publishWeek2();
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);

    const current = gradedOf(await familyWeek(db,grandma, SUNDAY, { graded: true, cfbd: angryFeed }));
    expect(current.sheet.locked).toBe(true);
    expect(current.result.reveal.games.find((g) => g.game.id === michigan.id)!.result.status).toBe("pending");
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

    const review = (await familyReview(fixture.db,undefined, SUNDAY))!;

    expect(review.played).toEqual([2, 3]);
    expect(review.slate.week.id).toBe(three.week.id);
    // The Reveal and the scores come from the Week it landed on, not from the live one.
    expect(review.result.reveal.week.weekNumber).toBe(3);
  });

  test("looks back at an older week when asked, and falls back when asked for one the season has not played", async () => {
    const fixture = await publishWeek2();
    await publishAlso(fixture, 3);
    const { db } = fixture;

    expect((await familyReview(db,2, SUNDAY))!.slate.week.weekNumber).toBe(2);
    // Week 9 does not exist, and week 1 was never published: both land on the latest played.
    expect((await familyReview(db,9, SUNDAY))!.slate.week.weekNumber).toBe(3);
    expect((await familyReview(db,1, SUNDAY))!.slate.week.weekNumber).toBe(3);
  });

  test("there is nothing to review until a deadline has passed", async () => {
    const { db, jonah } = await publishWeek2();

    // Thursday is inside Week 2: the Reveal is what the Deadline gates, so the
    // week is not reviewable yet — asked for by number or not.
    expect(await familyReview(db,undefined, THURSDAY)).toBeNull();
    expect(await familyReview(db,2, THURSDAY)).toBeNull();

    // An unpublished Week is not reviewable either, whatever the clock says:
    // asking for Week 4 lands on Week 2, the one the season has played.
    await openWeek(db, jonah, 4);
    expect((await familyReview(db,4, SUNDAY))!.slate.week.weekNumber).toBe(2);
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
    expect(review.result.reveal.games.find((g) => g.game.id === michigan.id)!.result.status).toBe("final");
    expect(review.result.scores.find((s) => s.member.id === grandma.id)!.points).toBe(10);

    await familyReview(db,2, SUNDAY, { cfbd: () => feed });
    expect(feed.calls).toBe(1);
  });
});

/** Every game on Week 2's slate final: Miami and Michigan win at home, Ohio State at Texas. */
const ALL_FINAL: Finals = {
  [FAMU_AT_MIAMI]: [7, 45],
  [OKLAHOMA_AT_MICHIGAN]: [24, 27],
  [OHIO_STATE_AT_TEXAS]: [31, 28],
};

describe("the landing route (#91's states)", () => {
  test("goes to the Leaderboard when no week is published", async () => {
    const { db, grandma } = await seedWeek2();
    expect(landingRoute(await familyWeek(db, grandma, THURSDAY, { graded: true }))).toBe("/leaderboard");
  });

  test("goes to Picks before the deadline", async () => {
    const { db, grandma } = await publishWeek2();
    expect(landingRoute(await familyWeek(db,grandma, THURSDAY, { graded: true }))).toBe("/picks");
  });

  test("goes to review once every Pick is in, Lock and Guess still to set", async () => {
    // The flow has no control for either, so a finished sheet lands on the
    // screen that does rather than at the top of a slate already decided.
    const { db, slate, grandma, miami, michigan, texas } = await publishWeek2();
    for (const game of [miami, michigan, texas]) {
      await pickAs(db, grandma, slate, game, game.homeTeamId, THURSDAY);
    }

    expect(landingRoute(await familyWeek(db,grandma, THURSDAY, { graded: true }))).toBe("/picks/review");
  });

  test("one game still open keeps the member in the flow", async () => {
    const { db, slate, grandma, miami, michigan } = await publishWeek2();
    await pickAs(db, grandma, slate, miami, miami.homeTeamId, THURSDAY);
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);

    expect(landingRoute(await familyWeek(db,grandma, THURSDAY, { graded: true }))).toBe("/picks");
  });

  test("a Void game the member never picked does not hold them in the flow", async () => {
    const { db, jonah, slate, grandma, miami, michigan, texas } = await publishWeek2();
    await pickAs(db, grandma, slate, miami, miami.homeTeamId, THURSDAY);
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    await voidGame(db, jonah, texas.id, "Hurricane");

    expect(landingRoute(await familyWeek(db,grandma, THURSDAY, { graded: true }))).toBe("/picks/review");
  });

  test("goes to the Live Board once locked but still grading", async () => {
    const { db, week, slate, grandma, michigan } = await publishWeek2();
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    await ingestResults(db, feedWithMichiganFinal(), await slateFor(db, week.id), SUNDAY);

    expect(landingRoute(await familyWeek(db,grandma, SUNDAY, { graded: true }))).toBe("/live");
  });

  test("goes to the Leaderboard once every non-void game is final", async () => {
    const { db, week, grandma } = await publishWeek2();
    await ingestResults(db, feedWith(ALL_FINAL), await slateFor(db, week.id), SUNDAY);

    expect(landingRoute(await familyWeek(db,grandma, SUNDAY, { graded: true }))).toBe("/leaderboard");
  });

  test("a member in no group lands on the Live Board, where the no-group screen is", async () => {
    const { db, week, grandma } = await publishWeek2();
    await ingestResults(db, feedWith(ALL_FINAL), await slateFor(db, week.id), SUNDAY);

    const ungrouped = await currentWeek(db, grandma, SUNDAY, { graded: true, group: null });
    expect(ungrouped!.state).toBe("ungrouped");
    expect(landingRoute(ungrouped)).toBe("/live");
  });

  test("a Week read without { graded: true } is not one landingRoute takes", async () => {
    // The state is `locked`: past the Deadline, live or settled not known. It
    // used to read as still live, silently, for a Week that had long settled.
    const { db, week, grandma } = await publishWeek2();
    await ingestResults(db, feedWith(ALL_FINAL), await slateFor(db, week.id), SUNDAY);

    const ungraded = await familyWeek(db, grandma, SUNDAY);
    expect(ungraded!.state).toBe("locked");
    // @ts-expect-error a WeekContext that skipped the grading has no place to land
    landingRoute(ungraded);
  });
});
