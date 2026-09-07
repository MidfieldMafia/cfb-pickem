import { describe, expect, test } from "vitest";
import type { GameResult } from "@/lib/results/result";
import type { RevealGame } from "@/lib/results/results";
import { MICHIGAN, TEXAS, VOIDED } from "@/test/sheet";
import { IDLE_POLL_MS, LIVE_POLL_MS, nextPollMs } from "./poll";

const IN_PROGRESS: GameResult = {
  ...MICHIGAN.result,
  live: { awayScore: 7, homeScore: 3, period: 2, clock: "04:10" },
  shown: { awayScore: 7, homeScore: 3 },
  label: "In progress",
};

const FINAL: GameResult = {
  ...MICHIGAN.result,
  status: "final",
  awayScore: 24,
  homeScore: 27,
  source: "feed",
  shown: { awayScore: 24, homeScore: 27 },
  label: "Final",
};

const row = (result: GameResult): RevealGame => ({ game: MICHIGAN.game, result, picks: [] });

describe("the Live Board's polling cadence", () => {
  test("polls every thirty seconds while a game is under way", () => {
    expect(nextPollMs({ complete: false, games: [row(TEXAS.result), row(IN_PROGRESS)] })).toBe(LIVE_POLL_MS);
  });

  test("polls every five minutes before kickoff and between games", () => {
    expect(nextPollMs({ complete: false, games: [row(TEXAS.result), row(MICHIGAN.result)] })).toBe(IDLE_POLL_MS);
    expect(nextPollMs({ complete: false, games: [row(FINAL), row(TEXAS.result)] })).toBe(IDLE_POLL_MS);
    // A Void does not count as under way, whatever the feed is doing to it.
    expect(nextPollMs({ complete: false, games: [row(VOIDED), row(TEXAS.result)] })).toBe(IDLE_POLL_MS);
  });

  test("stops once every game is final", () => {
    expect(nextPollMs({ complete: true, games: [row(FINAL), row(FINAL)] })).toBeNull();
    // `complete` is the engine's word and is what decides it; a Void beside finals is still complete.
    expect(nextPollMs({ complete: true, games: [row(FINAL), row(VOIDED)] })).toBeNull();
  });
});
