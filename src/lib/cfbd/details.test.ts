import { describe, expect, test } from "vitest";
import { weekDetails } from "./details";
import { recordedCfbd } from "./recorded";

const OKLAHOMA_AT_MICHIGAN = 401856679;
const FAMU_AT_MIAMI = 401858213;

describe("game detail for the pick screen", () => {
  test("joins records, season stats, points from played games, media, win probability, venue, and weather by id", async () => {
    const details = await weekDetails(recordedCfbd("2026-week-2"), { year: 2026, week: 2 });

    // Values read straight from the recorded responses: Michigan beat Western Michigan 13-12
    // on 276 yards to 221; Oklahoma beat UTEP 51-0 on 401 yards to 198.
    expect(details.get(OKLAHOMA_AT_MICHIGAN)).toEqual({
      venue: "Michigan Stadium",
      city: "Ann Arbor, MI",
      tv: "FOX",
      homeWinProbability: 0.568,
      homeSpread: -2.5,
      weather: {
        temperature: 82.6,
        precipitation: 0,
        windSpeed: 10.3,
        conditionCode: 0,
        condition: null,
        indoors: false,
      },
      home: { record: "1–0", pointsFor: 13, pointsAgainst: 12, yardsFor: 276, yardsAgainst: 221 },
      away: { record: "1–0", pointsFor: 51, pointsAgainst: 0, yardsFor: 401, yardsAgainst: 198 },
    });
  });

  test("an FCS opponent with no FBS stats or games still gets its record; the rest is null", async () => {
    const details = await weekDetails(recordedCfbd("2026-week-2"), { year: 2026, week: 2 });
    const famu = details.get(FAMU_AT_MIAMI)!;

    expect(famu.tv).toBe("ACC Network");
    expect(famu.away).toEqual({ record: "1–0", pointsFor: null, pointsAgainst: null, yardsFor: null, yardsAgainst: null });
  });

  test("a team that has not played yet shows 0–0 with no averages", async () => {
    const cfbd = recordedCfbd("2026-week-2", { records: [], teamStats: [], seasonGames: [] });
    const details = await weekDetails(cfbd, { year: 2026, week: 2 });
    expect(details.get(OKLAHOMA_AT_MICHIGAN)?.home).toEqual({
      record: "0–0",
      pointsFor: null,
      pointsAgainst: null,
      yardsFor: null,
      yardsAgainst: null,
    });
  });
});
