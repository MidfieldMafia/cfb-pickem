/**
 * Which poll a week's ranks come from. The recorded Week 2 feed carries the
 * real shape of the problem — the only poll week in it is week 1, and its
 * `polls` array lists the Coaches Poll before the AP — so it covers both the
 * look-back and the preference. The selection rules the recording cannot show
 * (a later poll week winning, null ranks, no poll at all) are built by hand.
 */
import { describe, expect, test } from "vitest";
import type { CfbdPollRank, CfbdPollWeek } from "./types";
import { rankLookup } from "./rankings";
import rankings2026 from "./fixtures/2026-week-2/rankings.json";

const RECORDED = rankings2026 as CfbdPollWeek[];

const OHIO_STATE = 194;
const TEXAS = 251;
const LOUISVILLE = 97;

function pollWeek(week: number, polls: Record<string, [number, number | null][]>): CfbdPollWeek {
  return {
    season: 2026,
    seasonType: "regular",
    week,
    polls: Object.entries(polls).map(([poll, ranks]) => ({
      poll,
      ranks: ranks.map(([teamId, rank]): CfbdPollRank => ({ rank, teamId, school: `Team ${teamId}`, conference: null })),
    })),
  };
}

describe("ranks for a week, from the recorded feed", () => {
  test("week 2 reads the week 1 poll, because its own is not out until the previous Saturday is played", () => {
    expect(RECORDED.map((w) => w.week)).toEqual([1]);

    const week2 = rankLookup(RECORDED, 2);

    expect(week2.size).toBe(25);
    expect(week2.get(OHIO_STATE)).toBe(1);
    expect(week2.get(TEXAS)).toBe(5);
    // The same answer for the week the poll actually belongs to.
    expect(rankLookup(RECORDED, 1)).toEqual(week2);
  });

  test("prefers the AP poll over the Coaches poll even when the feed lists Coaches first", () => {
    expect(RECORDED[0].polls.map((p) => p.poll)).toEqual(["Coaches Poll", "AP Top 25"]);

    const ranks = rankLookup(RECORDED, 2);

    // The two polls disagree here: AP has Texas 5th and Notre Dame 4th, Coaches has them swapped.
    expect(ranks.get(TEXAS)).toBe(5);
    // Louisville is 24th in the AP poll and unranked by the coaches, so it is absent if the wrong poll wins.
    expect(ranks.get(LOUISVILLE)).toBe(24);
  });

  test("a week before the first poll of the season has no ranks at all", () => {
    expect(rankLookup(RECORDED, 0).size).toBe(0);
  });
});

describe("choosing among poll weeks", () => {
  const weeks = [
    pollWeek(1, { "AP Top 25": [[1, 1]] }),
    pollWeek(3, { "AP Top 25": [[1, 3]] }),
    pollWeek(2, { "AP Top 25": [[1, 2]] }),
  ];

  test("takes the most recent poll on or before the week, whatever order the feed arrives in", () => {
    expect(rankLookup(weeks, 3).get(1)).toBe(3);
    expect(rankLookup(weeks, 2).get(1)).toBe(2);
    expect(rankLookup(weeks, 1).get(1)).toBe(1);
  });

  test("looks back past a gap rather than giving up", () => {
    expect(rankLookup(weeks, 9).get(1)).toBe(3);
  });

  test("never reads a poll published after the week", () => {
    expect(rankLookup([pollWeek(5, { "AP Top 25": [[1, 1]] })], 4).size).toBe(0);
  });

  test("falls through to the Coaches poll for a week the AP poll skipped", () => {
    const coachesOnly = [pollWeek(2, { "Coaches Poll": [[7, 12]] })];

    expect(rankLookup(coachesOnly, 2).get(7)).toBe(12);
  });

  test("keeps looking back when the nearest week holds no poll it recognises", () => {
    // Week 2 carries only a poll outside the preference, so week 1's AP ranks stand
    // rather than the slate going unranked.
    const unrecognised = [pollWeek(1, { "AP Top 25": [[1, 1]] }), pollWeek(2, { "FCS Coaches Poll": [[1, 9]] })];

    expect(rankLookup(unrecognised, 2).get(1)).toBe(1);
  });

  test("drops a team the poll lists without a rank", () => {
    const withNulls = [pollWeek(2, { "AP Top 25": [[1, 1], [2, null], [3, 3]] })];

    const ranks = rankLookup(withNulls, 2);

    expect([...ranks]).toEqual([
      [1, 1],
      [3, 3],
    ]);
    expect(ranks.has(2)).toBe(false);
  });

  test("no poll weeks at all is an empty lookup, not a throw", () => {
    expect(rankLookup([], 2).size).toBe(0);
  });
});
