/**
 * Recorded Open-Meteo responses for the test suite. Kept out of `open-meteo.ts`
 * so the fixture — a quarter of a megabyte of hourly series — never joins the
 * production module graph, the way `cfbd/recorded.ts` sits beside `cfbd/http.ts`.
 */
import { lookup, type HourlySeries, type RainChanceSource } from "./open-meteo";
import recording2026w2 from "./fixtures/2026-week-2.json";

export const rainRecordings = {
  "2026-week-2": recording2026w2 as { results: HourlySeries[] },
};

export type RainRecordingName = keyof typeof rainRecordings;

/** Replays a recording; points or hours it does not cover come back null. */
export function recordedOpenMeteo(name: RainRecordingName): RainChanceSource {
  const { results } = rainRecordings[name];
  return { rainChance: async (points) => lookup(results, points) };
}
