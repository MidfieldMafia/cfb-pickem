import { describe, expect, test } from "vitest";
import { httpOpenMeteo, recordedOpenMeteo } from "./open-meteo";

const MICHIGAN_STADIUM = { latitude: 42.2658365, longitude: -83.7486956 };
const HARD_ROCK = { latitude: 25.958, longitude: -80.2389 };

describe("chance of rain from Open-Meteo", () => {
  test("the recording answers each venue at its kickoff hour, and null outside the recorded window", async () => {
    const rain = recordedOpenMeteo("2026-week-2");
    const chances = await rain.rainChance([
      { ...MICHIGAN_STADIUM, at: new Date("2026-09-12T16:00:00Z") },
      { ...HARD_ROCK, at: new Date("2026-09-11T00:00:00Z") },
      // Minutes inside the hour round down to that hour.
      { ...MICHIGAN_STADIUM, at: new Date("2026-09-12T16:30:00Z") },
      { ...MICHIGAN_STADIUM, at: new Date("2026-10-10T16:00:00Z") },
      { latitude: 0, longitude: 0, at: new Date("2026-09-12T16:00:00Z") },
    ]);
    expect(chances).toEqual([8, 41, 8, null, null]);
  });

  test("the live client asks for every point in one call over the kickoff dates, and a refusal means no chance, not a crash", async () => {
    const calls: URL[] = [];
    const fetchImpl = (async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      calls.push(url);
      if (url.searchParams.get("start_date") === "2026-10-10") {
        return new Response(JSON.stringify({ error: true, reason: "out of allowed range" }), { status: 400 });
      }
      return new Response(
        JSON.stringify([
          { latitude: 42.27, longitude: -83.74, hourly: { time: ["2026-09-12T15:00", "2026-09-12T16:00"], precipitation_probability: [3, 8] } },
          { latitude: 25.96, longitude: -80.24, hourly: { time: ["2026-09-12T15:00", "2026-09-12T16:00"], precipitation_probability: [40, 41] } },
        ]),
      );
    }) as typeof fetch;
    const rain = httpOpenMeteo(fetchImpl);

    const chances = await rain.rainChance([
      { ...MICHIGAN_STADIUM, at: new Date("2026-09-12T16:10:00Z") },
      { ...HARD_ROCK, at: new Date("2026-09-12T15:00:00Z") },
    ]);
    expect(chances).toEqual([8, 40]);
    expect(calls).toHaveLength(1);
    expect(calls[0].searchParams.get("latitude")).toBe("42.2658365,25.958");
    expect(calls[0].searchParams.get("longitude")).toBe("-83.7486956,-80.2389");
    expect(calls[0].searchParams.get("start_date")).toBe("2026-09-12");
    expect(calls[0].searchParams.get("end_date")).toBe("2026-09-12");
    expect(calls[0].searchParams.get("hourly")).toBe("precipitation_probability");

    expect(await rain.rainChance([{ ...MICHIGAN_STADIUM, at: new Date("2026-10-10T16:00:00Z") }])).toEqual([null]);
    expect(await rain.rainChance([])).toEqual([]);
  });
});
