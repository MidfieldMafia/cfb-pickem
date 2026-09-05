import { describe, expect, test } from "vitest";
import { recordedCfbd } from "./recorded";
import { weekCandidates } from "./candidates";

describe("week candidates from CollegeFootballData", () => {
  test("joins games, the latest poll, and a spread by numeric id, sorted by kickoff", async () => {
    const candidates = await weekCandidates(recordedCfbd("2026-week-2"), { year: 2026, week: 2 });

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
    const candidates = await weekCandidates(recordedCfbd("2026-week-2"), { year: 2026, week: 2 });

    const famu = candidates.find((c) => c.cfbdGameId === 401858213);
    expect(famu).toMatchObject({ awayTeam: "Florida A&M", awayRank: null, awayConference: "SWAC" });
    expect(candidates.filter((c) => c.spread === null)).toHaveLength(46);
  });
});
