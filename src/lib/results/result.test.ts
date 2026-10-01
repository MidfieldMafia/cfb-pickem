import { describe, expect, test } from "vitest";
import type { LiveFeed } from "./live-feed";
import { clockLabel, sideWithBall, type LiveScore } from "./result";

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
