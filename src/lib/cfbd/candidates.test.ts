import { describe, expect, test } from "vitest";
import { recordedOpenMeteo } from "@/lib/weather/recorded";
import { recordedCfbd } from "./recorded";
import { weekCandidates } from "./candidates";

const WEEK_2 = { year: 2026, week: 2 };
const rain = recordedOpenMeteo("2026-week-2");

describe("week candidates from CollegeFootballData", () => {
  test("joins games, the latest poll, and a spread by numeric id, sorted by kickoff", async () => {
    const candidates = await weekCandidates(recordedCfbd("2026-week-2"), WEEK_2, rain);

    expect(candidates).toHaveLength(86);
    expect(candidates.map((c) => c.kickoff.getTime())).toEqual(
      [...candidates.map((c) => c.kickoff.getTime())].sort((a, b) => a - b),
    );

    const texas = candidates.find((c) => c.cfbdGameId === 401856682);
    expect(texas).toMatchObject({
      homeTeamId: 251,
      homeTeam: "Texas",
      homeRank: 5,
      homeConference: "SEC",
      awayTeamId: 194,
      awayTeam: "Ohio State",
      awayRank: 1,
      awayConference: "Big Ten",
      spread: "Texas -1.5",
    });
    expect(texas?.kickoff.toISOString()).toBe("2026-09-12T23:30:00.000Z");
  });

  test("an unranked team has no rank and a game without a line has no spread", async () => {
    const candidates = await weekCandidates(recordedCfbd("2026-week-2"), WEEK_2, rain);

    const famu = candidates.find((c) => c.cfbdGameId === 401858213);
    expect(famu).toMatchObject({ awayTeam: "Florida A&M", awayRank: null, awayConference: "SWAC" });
    expect(candidates.filter((c) => c.spread === null)).toHaveLength(46);
  });

  test("spreadValue carries the book's number, home-team perspective", async () => {
    const candidates = await weekCandidates(recordedCfbd("2026-week-2"), WEEK_2, rain);
    // Oklahoma -1.5 at Michigan: the favorite is away, so home-perspective is positive.
    const oklahoma = candidates.find((c) => c.cfbdGameId === 401856679);
    expect(oklahoma).toMatchObject({ spread: "Oklahoma -1.5", spreadValue: 1.5 });
  });

  test("spreadValue falls back to the win-probability model when no book has posted", async () => {
    const candidates = await weekCandidates(recordedCfbd("2026-week-2"), WEEK_2, rain);
    // Boston College at Rutgers: no sportsbook line, but the model has one.
    const bc = candidates.find((c) => c.cfbdGameId === 401858214)!;

    expect(bc.spread).toBeNull();
    expect(bc.spreadValue).toBe(-3.5);
  });

  test("spreadValue is null only when neither a book nor the model has a number", async () => {
    const candidates = await weekCandidates(recordedCfbd("2026-week-2"), WEEK_2, rain);
    const noNumber = candidates.filter((c) => c.spreadValue === null);

    expect(noNumber.length).toBeGreaterThan(0);
    expect(noNumber.length).toBeLessThan(candidates.filter((c) => c.spread === null).length);
  });

  test("a week costs one read per endpoint, not one per caller that wants it", async () => {
    const cfbd = recordedCfbd("2026-week-2");

    await weekCandidates(cfbd, WEEK_2, rain);

    // `CfbdClient` has ten methods and the slate builder needs all ten. Anything
    // above ten is a caller asking twice, which is free here and quota in production.
    expect(cfbd.calls).toBe(10);
  });
});
