import { describe, expect, test } from "vitest";
import { noRainChance, recordedOpenMeteo } from "@/lib/weather/open-meteo";
import { weekDetails } from "./details";
import { recordedCfbd } from "./recorded";

const OKLAHOMA_AT_MICHIGAN = 401856679;
const FAMU_AT_MIAMI = 401858213;
const WEEK_2 = { year: 2026, week: 2 };

describe("game detail for the pick screen", () => {
  test("joins records, season stats, points from played games, media, win probability, venue, weather, and rain chance by id", async () => {
    const details = await weekDetails(recordedCfbd("2026-week-2"), recordedOpenMeteo("2026-week-2"), WEEK_2);

    // Values read straight from the recorded responses: Michigan beat Western Michigan 13-12
    // on 276 yards to 221; Oklahoma beat UTEP 51-0 on 401 yards to 198. The Week 2 AP poll has
    // Oklahoma 10th and Michigan 16th; the line is Oklahoma -1.5; Open-Meteo says 8% at kickoff.
    expect(details.get(OKLAHOMA_AT_MICHIGAN)).toEqual({
      gameId: "401856679",
      kickoff: "2026-09-12T16:00:00.000Z",
      venue: "Michigan Stadium",
      city: "Ann Arbor, MI",
      tv: "FOX",
      homeWp: 0.568,
      spread: "Oklahoma -1.5",
      weather: { temperature: 83, precipitation: 8, icon: "cloud-sun", wind: 10 },
      home: { rank: 16, record: "1–0", pointsFor: 13, pointsAgainst: 12, yardsFor: 276, yardsAgainst: 221 },
      away: { rank: 10, record: "1–0", pointsFor: 51, pointsAgainst: 0, yardsFor: 401, yardsAgainst: 198 },
    });
  });

  test("an FCS opponent with no FBS stats or games still gets its record; the averages are null", async () => {
    const details = await weekDetails(recordedCfbd("2026-week-2"), recordedOpenMeteo("2026-week-2"), WEEK_2);
    const famu = details.get(FAMU_AT_MIAMI)!;

    expect(famu.tv).toBe("ACC Network");
    expect(famu.weather?.precipitation).toBe(41);
    expect(famu.away).toEqual({
      rank: null,
      record: "1–0",
      pointsFor: null,
      pointsAgainst: null,
      yardsFor: null,
      yardsAgainst: null,
    });
  });

  test("a team that has not played shows 0–0 with no averages, an unforecast game has no rain figure, and no line means Pick", async () => {
    const cfbd = recordedCfbd("2026-week-2", { records: [], teamStats: [], seasonGames: [], lines: [], pregameWinProbability: [] });
    const details = await weekDetails(cfbd, noRainChance, WEEK_2);
    const game = details.get(OKLAHOMA_AT_MICHIGAN)!;
    expect(game.home).toEqual({ rank: 16, record: "0–0", pointsFor: null, pointsAgainst: null, yardsFor: null, yardsAgainst: null });
    expect(game.spread).toBe("Pick");
    expect(game.homeWp).toBeNull();
    expect(game.weather?.precipitation).toBeNull();
  });

  test("the sky icon follows the feed's condition code, and a dome has no weather at all", async () => {
    const base = recordedCfbd("2026-week-2");
    const weather = (await base.weather(WEEK_2)).map((w) => {
      if (w.id === OKLAHOMA_AT_MICHIGAN) return { ...w, weatherConditionCode: 8, weatherCondition: "Rain" };
      if (w.id === FAMU_AT_MIAMI) return { ...w, gameIndoors: true };
      return w;
    });
    const details = await weekDetails(recordedCfbd("2026-week-2", { weather }), noRainChance, WEEK_2);
    expect(details.get(OKLAHOMA_AT_MICHIGAN)?.weather?.icon).toBe("cloud-rain");
    expect(details.get(FAMU_AT_MIAMI)?.weather).toBeNull();
  });
});
