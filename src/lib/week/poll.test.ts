import { describe, expect, test } from "vitest";
import type { GameResult } from "@/lib/results/result";
import { DUE, finalResult, liveResult } from "@/test/game";
import { MICHIGAN, TEXAS, VOIDED } from "@/test/sheet";
import type { LiveGameJson } from "./json";
import { IDLE_POLL_MS, LIVE_POLL_MS, nextPollMs } from "./poll";

const IN_PROGRESS = liveResult(7, 3, { period: 2, clock: "04:10" });
const FINAL = finalResult(24, 27);

const row = (result: GameResult): LiveGameJson => ({ game: MICHIGAN.game, result, picks: [], detail: null, ownPick: null });

describe("the Live Board's polling cadence", () => {
  test("polls every thirty seconds while a game is under way", () => {
    expect(nextPollMs({ complete: false, games: [row(TEXAS.result), row(IN_PROGRESS)] })).toBe(LIVE_POLL_MS);
  });

  test("polls every thirty seconds from kickoff, before the feed has a score", () => {
    // Otherwise the first score of the day reaches the board up to five minutes late.
    expect(nextPollMs({ complete: false, games: [row(TEXAS.result), row(DUE)] })).toBe(LIVE_POLL_MS);
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
