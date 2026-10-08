import { describe, expect, test } from "vitest";
import type { LiveFeed } from "./live-feed";
import { AFTER_KICKOFF, BEFORE_KICKOFF, gameRow, KICKOFF, resultOf } from "@/test/game";
import { clockLabel, describeResult, sideWithBall, underway, type LiveScore } from "./result";

/**
 * The one spelling of where a game in progress stands. Three screens put it
 * beside a score, and the feed's own shape — a padded clock, a period that
 * counts past four for overtime — is not what a person reads.
 */
describe("the clock label", () => {
  test("reads the quarter and the clock, without the feed's leading zero", () => {
    expect(clockLabel({ period: 3, clock: "08:12" })).toBe("Q3 · 8:12");
    expect(clockLabel({ period: 1, clock: "15:00" })).toBe("Q1 · 15:00");
    expect(clockLabel({ period: 2, clock: "00:00" })).toBe("Q2 · 0:00");
  });

  test("calls the fifth period overtime and counts from there", () => {
    expect(clockLabel({ period: 5, clock: "02:00" })).toBe("OT · 2:00");
    expect(clockLabel({ period: 6, clock: null })).toBe("2OT");
  });

  test("says only what the feed has said, and nothing when it has said nothing", () => {
    expect(clockLabel({ period: 4, clock: null })).toBe("Q4");
    expect(clockLabel({ period: null, clock: "05:30" })).toBe("5:30");
    expect(clockLabel({ period: null, clock: null })).toBeNull();
  });
});

/**
 * Who has the ball, for the Live Board's football (#208). The live feed's
 * resting side wins whenever the feed carries the game — including its null
 * at a break, which the scoreboard's stale `possession` must not paper over.
 * Only a game the feed has not carried reads the scoreboard.
 */
describe("the team with the ball", () => {
  const live: LiveScore = {
    awayScore: 7,
    homeScore: 3,
    period: 2,
    clock: "04:10",
    possession: "home",
    lastPlay: null,
    situation: null,
    feed: null,
  };
  const feed = (ball: LiveFeed["ball"]): LiveFeed => ({
    play: {
      id: "1",
      text: "Kickoff",
      type: "Kickoff",
      teamId: 1,
      team: "Away",
      period: 2,
      clock: "4:10",
      wallClock: "2026-09-12T23:45:00.000Z",
      homeScore: 3,
      awayScore: 7,
    },
    down: 1,
    distance: 10,
    yardsToGoal: 75,
    ball,
  });

  test("reads the feed's resting side, not the scoreboard's kicking team", () => {
    expect(sideWithBall({ ...live, feed: feed("away") })).toBe("away");
  });

  test("is no one at a break the feed has logged, whatever the scoreboard says", () => {
    expect(sideWithBall({ ...live, feed: feed(null) })).toBeNull();
  });

  test("falls back to the scoreboard only when the feed carries no play", () => {
    expect(sideWithBall(live)).toBe("home");
    expect(sideWithBall({ ...live, possession: null })).toBeNull();
  });
});

/**
 * Where a Game stands: one phase, decided in one order — the Void, the Result
 * Override, the feed's final, the feed's running score, then the clock.
 */
describe("a Game's phase", () => {
  const inProgress = { status: "in_progress" as const, awayScore: 7, homeScore: 3, period: 2, clock: "04:10" };

  test("is scheduled before kickoff and due after it, until the feed says anything", () => {
    expect(resultOf({}, BEFORE_KICKOFF)).toMatchObject({ phase: "scheduled", live: null, shown: null, label: "Scheduled" });
    // Due shows as scheduled does: the same label, nothing to score, no live score.
    expect(resultOf({}, AFTER_KICKOFF)).toMatchObject({ phase: "due", live: null, shown: null, label: "Scheduled" });
    // Kickoff itself is past it.
    expect(resultOf({}, KICKOFF).phase).toBe("due");
  });

  test("is in progress once the feed has a running score, whatever the clock says", () => {
    // An early start: the feed's word beats the kickoff time.
    expect(resultOf(inProgress, BEFORE_KICKOFF)).toMatchObject({ phase: "in_progress", label: "In progress" });
    expect(resultOf(inProgress, AFTER_KICKOFF).live).toMatchObject({ awayScore: 7, homeScore: 3, period: 2 });
  });

  test("is final from the feed's final", () => {
    expect(resultOf({ status: "final", awayScore: 24, homeScore: 27 }, AFTER_KICKOFF)).toMatchObject({
      phase: "final",
      source: "feed",
      live: null,
    });
  });

  test("is final from a Result Override standing over a feed that is still in progress", () => {
    const result = resultOf({ ...inProgress, overrideAwayScore: 24, overrideHomeScore: 27 }, AFTER_KICKOFF);
    expect(result).toMatchObject({ phase: "final", source: "override", awayScore: 24, homeScore: 27, live: null });
  });

  test("is void over everything, an override included", () => {
    const result = resultOf({ ...inProgress, void: true, voidNote: "Lightning", overrideAwayScore: 24, overrideHomeScore: 27 });
    expect(result).toMatchObject({ phase: "void", live: null, shown: null, note: "Lightning" });
  });

  test("is under way while due or in progress, and at no other phase", () => {
    expect(underway(resultOf({}, AFTER_KICKOFF))).toBe(true);
    expect(underway(resultOf(inProgress, AFTER_KICKOFF))).toBe(true);
    expect(underway(resultOf({}, BEFORE_KICKOFF))).toBe(false);
    expect(underway(resultOf({ status: "final", awayScore: 24, homeScore: 27 }, AFTER_KICKOFF))).toBe(false);
    expect(underway(resultOf({ void: true }, AFTER_KICKOFF))).toBe(false);
  });

  test("never reaches the audit log: every phase short of final is written as pending", () => {
    expect(describeResult(gameRow())).toBe("pending");
    expect(describeResult(gameRow(inProgress))).toBe("pending");
    expect(describeResult(gameRow({ void: true }))).toBe("void");
    expect(describeResult(gameRow({ status: "final", awayScore: 24, homeScore: 27 }))).toBe("Oklahoma 24, Michigan 27");
  });
});
