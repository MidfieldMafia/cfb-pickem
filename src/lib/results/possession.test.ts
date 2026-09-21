import { describe, expect, test, vi } from "vitest";
import type { CfbdScoreboardGame } from "@/lib/cfbd/types";
import { possessionSide } from "./results";

/**
 * Ohio State (194) at Texas (251), under way. `possession` is the one field
 * on the scoreboard whose value has never been observed, so the resolver is
 * written to place what it recognises and refuse everything else rather than
 * guess — these are the branches it can take.
 */
function board(possession: string | null, overrides: Partial<CfbdScoreboardGame> = {}): CfbdScoreboardGame {
  return {
    id: 401856682,
    startDate: "2026-09-12T19:30:00.000Z",
    startTimeTBD: false,
    tv: "ABC",
    neutralSite: false,
    conferenceGame: false,
    status: "in_progress",
    period: 3,
    clock: "08:12",
    situation: "3rd & 7",
    possession,
    lastPlay: "Quinn Ewers pass incomplete to DeAndre Moore Jr.",
    homeTeam: { id: 251, name: "Texas Longhorns", conference: "SEC", classification: "fbs", points: 14, lineScores: null, winProbability: null },
    awayTeam: { id: 194, name: "Ohio State Buckeyes", conference: "Big Ten", classification: "fbs", points: 17, lineScores: null, winProbability: null },
    ...overrides,
  };
}

describe("which team has the ball", () => {
  test("takes the feed's own words for a side, whatever the casing or padding", () => {
    expect(possessionSide(board("home"))).toBe("home");
    expect(possessionSide(board("away"))).toBe("away");
    expect(possessionSide(board("  HOME  "))).toBe("home");
    expect(possessionSide(board("Away"))).toBe("away");
  });

  test("places an ESPN team id against the two teams on the same row", () => {
    // No second call and no name join: both ids are already on the payload.
    expect(possessionSide(board("251"))).toBe("home");
    expect(possessionSide(board("194"))).toBe("away");
  });

  test("says nothing when the feed says nothing", () => {
    expect(possessionSide(board(null))).toBeNull();
    expect(possessionSide(board(""))).toBeNull();
    expect(possessionSide(board("   "))).toBeNull();
  });

  test("refuses a value it cannot place rather than guessing at it", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      // An abbreviation is the live possibility the five-character column leaves open.
      expect(possessionSide(board("TEX"))).toBeNull();
      // A team id belonging to neither side is not this game's ball.
      expect(possessionSide(board("130"))).toBeNull();

      // The safety net: the raw value is logged, so a feed that speaks
      // abbreviations shows no footballs on day one and says what to add.
      expect(info).toHaveBeenCalledTimes(2);
      expect(info.mock.calls[0][0]).toContain('"TEX"');
      expect(info.mock.calls[0][0]).toContain("401856682");
    } finally {
      info.mockRestore();
    }
  });

  test("stays quiet about a game that is not under way", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      // Nothing has the ball before kickoff or after the final, so an
      // unplaceable value there is not news worth a line in the log.
      expect(possessionSide(board("TEX", { status: "scheduled" }))).toBeNull();
      expect(possessionSide(board("TEX", { status: "completed" }))).toBeNull();
      expect(info).not.toHaveBeenCalled();
    } finally {
      info.mockRestore();
    }
  });
});
