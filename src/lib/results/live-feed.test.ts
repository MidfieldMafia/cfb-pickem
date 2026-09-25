import { describe, expect, test } from "vitest";
import { LIBERTY_AT_COASTAL_Q2, noPlays } from "@/lib/cfbd/recorded";
import { newerScore, newestPlay, toLiveFeed, type LiveFeed } from "./live-feed";

describe("the row's slice of the live feed", () => {
  test("is the newest play and the header's next snap, from a real mid-game response", () => {
    expect(toLiveFeed(LIBERTY_AT_COASTAL_Q2)).toEqual({
      play: {
        id: "401869941249",
        text: "(10:31) No Huddle-Shotgun #4 K.Davis rush middle for 3 yards gain to the CCU31 (#92 A.Poole; #4 M.Pulliam)",
        type: "Rush",
        teamId: 2335,
        team: "Liberty",
        period: 2,
        clock: "10:27",
        wallClock: "2026-09-25T00:52:07.000Z",
        homeScore: 3,
        awayScore: 10,
      },
      // The header, not the play: the play's own down and spot are where it started.
      down: 2,
      distance: 7,
      yardsToGoal: 31,
    });
  });

  test("the newest play is the last one logged, past a drive with none", () => {
    const [drive] = LIBERTY_AT_COASTAL_Q2.drives;
    expect(newestPlay([drive, { ...drive, plays: [] }])?.id).toBe("401869941249");
    expect(newestPlay([])).toBeNull();
  });

  test("a game the feed has logged nothing for has no slice", () => {
    expect(toLiveFeed(noPlays(401856682))).toBeNull();
  });

  test.each([
    ["after a timeout", 0],
    ["after a touchdown", -1],
    ["once final", null],
  ])("the header's down %s is no down-and-distance", (_, down) => {
    const feed = toLiveFeed({ ...LIBERTY_AT_COASTAL_Q2, down, distance: 0 })!;
    expect(feed).toMatchObject({ down: null, distance: null, yardsToGoal: 31 });
  });
});

describe("the running score to show", () => {
  const feed = (period: number, clock: string, awayScore: number, homeScore: number): LiveFeed => ({
    ...toLiveFeed(LIBERTY_AT_COASTAL_Q2)!,
    play: { ...toLiveFeed(LIBERTY_AT_COASTAL_Q2)!.play, period, clock, awayScore, homeScore },
  });
  const board = (period: number | null, clock: string | null) => ({ awayScore: 3, homeScore: 0, period, clock });

  test("is the feed's when its newest play is later in the game than the scoreboard", () => {
    // The scoreboard pads the clock and the feed does not; both are read as time left.
    expect(newerScore(board(1, "08:42"), feed(1, "6:10", 3, 7))).toEqual({ awayScore: 3, homeScore: 7 });
    expect(newerScore(board(1, "00:40"), feed(2, "14:55", 3, 7))).toEqual({ awayScore: 3, homeScore: 7 });
  });

  test("is the feed's at the same moment, since the scoreboard never led it", () => {
    expect(newerScore(board(1, "08:42"), feed(1, "8:42", 3, 7))).toEqual({ awayScore: 3, homeScore: 7 });
  });

  test("is the feed's when the scoreboard cannot say where it is", () => {
    expect(newerScore(board(null, null), feed(1, "8:42", 3, 7))).toEqual({ awayScore: 3, homeScore: 7 });
    expect(newerScore(board(1, null), feed(1, "8:42", 3, 7))).toEqual({ awayScore: 3, homeScore: 7 });
  });

  test("stays the scoreboard's when it is further on: a feed whose fetches have been failing", () => {
    expect(newerScore(board(1, "05:00"), feed(1, "8:42", 0, 0))).toEqual({ awayScore: 3, homeScore: 0 });
    expect(newerScore(board(2, "14:00"), feed(1, "0:12", 0, 0))).toEqual({ awayScore: 3, homeScore: 0 });
  });

  test("is the scoreboard's with no feed", () => {
    expect(newerScore(board(1, "08:42"), null)).toEqual({ awayScore: 3, homeScore: 0 });
  });
});
