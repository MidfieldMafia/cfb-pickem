import { describe, expect, test } from "vitest";
import type { LiveFeed } from "./live-feed";
import { downAndDistance, lastPlayLine } from "./live-row";
import type { LiveScore } from "./result";

/** Liberty at Coastal Carolina, as the feed spells them. */
const TEAMS = { homeTeam: "Coastal Carolina", awayTeam: "Liberty" };

const live: LiveScore = {
  awayScore: 10,
  homeScore: 3,
  period: 2,
  clock: "10:27",
  possession: "home",
  lastPlay: "Scoreboard's last play",
  situation: "2nd & 7 at CCU 31",
  feed: null,
};

const feed = (header: Partial<LiveFeed> = {}, play: Partial<LiveFeed["play"]> = {}): LiveFeed => ({
  play: {
    id: "401869941249",
    text: "(10:31) K.Davis rush middle for 3 yards gain to the CCU31",
    type: "Rush",
    teamId: 2335,
    team: "Liberty",
    period: 2,
    clock: "10:27",
    wallClock: "2026-09-25T00:52:07.000Z",
    homeScore: 3,
    awayScore: 10,
    ...play,
  },
  down: 2,
  distance: 7,
  yardsToGoal: 31,
  ball: "away",
  homeAbbr: "CCU",
  awayAbbr: "LIB",
  ...header,
});

/**
 * The top-left of a live row (#209, as amended by #311): built from the feed
 * header's down, distance and yards to goal, with the spot's side taken from
 * the team with the ball rather than the header's `possession`.
 */
describe("the down-and-distance", () => {
  test("names the defending side's half when the ball is across midfield", () => {
    expect(downAndDistance({ ...live, feed: feed() }, TEAMS)).toBe("2nd & 7 at CCU 31");
  });

  test("names the offense's own half when it has not crossed midfield", () => {
    expect(downAndDistance({ ...live, feed: feed({ down: 1, distance: 10, yardsToGoal: 75 }) }, TEAMS)).toBe(
      "1st & 10 at LIB 25",
    );
  });

  test("reads the receiving side after a kick, not the kicking team the header names", () => {
    // r01: Liberty had just kicked off; it was Coastal's ball at the LIB49.
    const r01 = feed({ down: 1, distance: 10, yardsToGoal: 49, ball: "home" }, { type: "Kickoff" });
    expect(downAndDistance({ ...live, feed: r01 }, TEAMS)).toBe("1st & 10 at LIB 49");
  });

  test("says midfield without a side", () => {
    expect(downAndDistance({ ...live, feed: feed({ down: 3, distance: 2, yardsToGoal: 50 }) }, TEAMS)).toBe(
      "3rd & 2 at 50",
    );
  });

  test("reads Goal when the distance reaches the goal line", () => {
    expect(downAndDistance({ ...live, feed: feed({ down: 1, distance: 5, yardsToGoal: 5 }) }, TEAMS)).toBe(
      "1st & Goal at CCU 5",
    );
  });

  test("uses the team's name until the feed has placed its abbreviation", () => {
    expect(downAndDistance({ ...live, feed: feed({ homeAbbr: null }) }, TEAMS)).toBe(
      "2nd & 7 at Coastal Carolina 31",
    );
    // A slice stored before the abbreviations were.
    expect(downAndDistance({ ...live, feed: feed({ homeAbbr: undefined }) }, TEAMS)).toBe(
      "2nd & 7 at Coastal Carolina 31",
    );
  });

  test("leaves the spot off when nothing says whose ball it is", () => {
    expect(downAndDistance({ ...live, feed: feed({ ball: null }) }, TEAMS)).toBe("2nd & 7");
    expect(downAndDistance({ ...live, feed: feed({ yardsToGoal: null }) }, TEAMS)).toBe("2nd & 7");
  });

  test("is empty with no down to play, even when the scoreboard has one", () => {
    expect(downAndDistance({ ...live, feed: feed({ down: null, distance: null }) }, TEAMS)).toBeNull();
  });

  test("falls back to the scoreboard's words only when the feed carries no play", () => {
    expect(downAndDistance(live, TEAMS)).toBe("2nd & 7 at CCU 31");
    expect(downAndDistance({ ...live, situation: null }, TEAMS)).toBeNull();
  });
});

/** The last-play line between the second team line and the split bar, with the play's age at its end. */
describe("the last-play line", () => {
  const at = (wallClock: string, ms: number) => new Date(wallClock).getTime() + ms;
  const logged = "2026-09-25T00:52:07.000Z";

  test("is the newest play's words and how long ago it was logged", () => {
    expect(lastPlayLine({ ...live, feed: feed() }, at(logged, 40_000))).toEqual({
      text: "(10:31) K.Davis rush middle for 3 yards gain to the CCU31",
      age: "40s ago",
      stale: false,
    });
  });

  test("turns stale at ten minutes", () => {
    expect(lastPlayLine({ ...live, feed: feed() }, at(logged, 10 * 60_000 - 1_000))).toMatchObject({
      age: "9m ago",
      stale: false,
    });
    expect(lastPlayLine({ ...live, feed: feed() }, at(logged, 10 * 60_000))).toMatchObject({
      age: "10m ago",
      stale: true,
    });
  });

  test.each(["End Period", "Halftime"])("never turns stale at an announced break: %s", (type) => {
    const line = lastPlayLine({ ...live, feed: feed({}, { type, text: "End of 2nd Quarter" }) }, at(logged, 20 * 60_000));
    expect(line).toEqual({ text: "End of 2nd Quarter", age: "20m ago", stale: false });
  });

  test("reads a play logged ahead of the server's clock as just now", () => {
    expect(lastPlayLine({ ...live, feed: feed() }, at(logged, -5_000))).toMatchObject({ age: "just now" });
  });

  test("falls back to the scoreboard's last play, with no age, when the feed carries no play", () => {
    expect(lastPlayLine(live, at(logged, 0))).toEqual({ text: "Scoreboard's last play", age: null, stale: false });
  });

  test("is no line at all when neither has a play", () => {
    expect(lastPlayLine({ ...live, lastPlay: null }, at(logged, 0))).toBeNull();
  });
});
