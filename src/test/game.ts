/**
 * A Game row by hand, and its result the only way the app ever makes one:
 * through `effectiveResult`. Tests that need a `GameResult` build it here
 * rather than writing the object out, because a hand-written one can say
 * things `effectiveResult` never would — a running score on a scheduled game,
 * a `live` with no phase to match it.
 *
 * Plain rows rather than the database fixture, for the suites that run without
 * one. Oklahoma at Michigan, Saturday noon Eastern, scheduled and unplayed;
 * each test overrides only what it is about.
 */
import type { Game } from "@/db/schema";
import { effectiveResult, type GameResult } from "@/lib/results/result";

export const KICKOFF = new Date("2026-09-12T16:00:00Z");
/** An hour before `KICKOFF`: the clock every result here is read at unless a test says otherwise. */
export const BEFORE_KICKOFF = new Date(KICKOFF.getTime() - 3600_000);
/** An hour after `KICKOFF`. */
export const AFTER_KICKOFF = new Date(KICKOFF.getTime() + 3600_000);

export function gameRow(overrides: Partial<Game> = {}): Game {
  return {
    id: 7,
    weekId: 1,
    cfbdGameId: 401856679,
    homeTeamId: 130,
    homeTeam: "Michigan",
    homeRank: null,
    homeConference: "Big Ten",
    awayTeamId: 201,
    awayTeam: "Oklahoma",
    awayRank: null,
    awayConference: "SEC",
    kickoff: KICKOFF,
    spread: null,
    detail: null,
    homeScore: null,
    awayScore: null,
    status: "scheduled",
    period: null,
    clock: null,
    possession: null,
    lastPlay: null,
    situation: null,
    liveFeed: null,
    void: false,
    voidNote: null,
    overrideHomeScore: null,
    overrideAwayScore: null,
    overrideNote: null,
    createdAt: KICKOFF,
    updatedAt: KICKOFF,
    ...overrides,
  };
}

/** The result of `gameRow(overrides)`, read at `now`. */
export function resultOf(overrides: Partial<Game> = {}, now: Date = BEFORE_KICKOFF): GameResult {
  return effectiveResult(gameRow(overrides), now);
}

/** Not kicked off. */
export const SCHEDULED = resultOf();

/** Past kickoff, with nothing from the feed. */
export const DUE = resultOf({}, AFTER_KICKOFF);

/** Final from the feed, the away side ahead. */
export function finalResult(awayScore: number, homeScore: number): GameResult {
  return resultOf({ status: "final", awayScore, homeScore }, AFTER_KICKOFF);
}

/** Under way, with the feed's running score and, optionally, more of what it says. */
export function liveResult(awayScore: number, homeScore: number, feed: Partial<Game> = {}): GameResult {
  return resultOf({ status: "in_progress", awayScore, homeScore, ...feed }, AFTER_KICKOFF);
}

/** Void, with the commissioner's note. */
export function voidResult(note: string | null = "Postponed"): GameResult {
  return resultOf({ void: true, voidNote: note });
}
