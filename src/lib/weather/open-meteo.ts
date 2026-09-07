/**
 * Chance of rain at kickoff, from Open-Meteo. CollegeFootballData's weather
 * feed carries temperature, wind, and sky, but only precipitation amounts,
 * never a probability; this fills that one gap. Open-Meteo is free, needs no
 * key, and answers many locations in one call, so a week's slate costs a
 * single request. Forecasts run about sixteen days ahead; anything further
 * out is null and the pill simply omits the figure.
 */
export interface ForecastPoint {
  latitude: number;
  longitude: number;
  /** The kickoff instant. Rounded down to the hour. */
  at: Date;
}

export interface RainChanceSource {
  /** Percent chance of precipitation per point, in the same order; null when unknown. */
  rainChance(points: ForecastPoint[]): Promise<(number | null)[]>;
}

/** One Open-Meteo hourly series. Shared with the recorded double. */
export interface HourlySeries {
  latitude: number;
  longitude: number;
  hourly: { time: string[]; precipitation_probability: (number | null)[] };
}

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

/** No answer for any point: the horizon, or a feed that did not respond. */
function unknown(points: ForecastPoint[]): (number | null)[] {
  return points.map(() => null);
}

/** "2026-09-12T16:00": Open-Meteo's UTC hour key, matching the ISO hour of the point. */
function hourKey(at: Date): string {
  return at.toISOString().slice(0, 13) + ":00";
}

function dateKey(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** Open-Meteo snaps coordinates to its grid, so match each point to the closest series. */
function closest(series: HourlySeries[], point: ForecastPoint): HourlySeries | undefined {
  let best: HourlySeries | undefined;
  let bestDistance = 0.25;
  for (const s of series) {
    const distance = Math.hypot(s.latitude - point.latitude, s.longitude - point.longitude);
    if (distance < bestDistance) {
      best = s;
      bestDistance = distance;
    }
  }
  return best;
}

export function lookup(series: HourlySeries[], points: ForecastPoint[]): (number | null)[] {
  return points.map((point) => {
    const s = closest(series, point);
    if (!s) return null;
    const index = s.hourly.time.indexOf(hourKey(point.at));
    return index === -1 ? null : (s.hourly.precipitation_probability[index] ?? null);
  });
}

/** The live source. One call for every point, spanning the earliest to the latest kickoff date. */
export function httpOpenMeteo(fetchImpl: typeof fetch = fetch): RainChanceSource {
  return {
    async rainChance(points) {
      if (points.length === 0) return [];
      const dates = points.map((p) => dateKey(p.at)).sort();
      const url = new URL(OPEN_METEO_URL);
      url.searchParams.set("latitude", points.map((p) => p.latitude).join(","));
      url.searchParams.set("longitude", points.map((p) => p.longitude).join(","));
      url.searchParams.set("hourly", "precipitation_probability");
      url.searchParams.set("timezone", "UTC");
      url.searchParams.set("start_date", dates[0]);
      url.searchParams.set("end_date", dates[dates.length - 1]);
      let series: HourlySeries[];
      try {
        const response = await fetchImpl(url);
        if (!response.ok) return unknown(points);
        const body: unknown = await response.json();
        series = Array.isArray(body) ? (body as HourlySeries[]) : [body as HourlySeries];
      } catch {
        return unknown(points);
      }
      return lookup(series, points);
    },
  };
}

/** A source that never knows: for callers that have no forecast wired. */
export const noRainChance: RainChanceSource = {
  rainChance: async (points) => unknown(points),
};

/** The production source. Holds nothing worth caching, unlike `db()` and `cfbd()`. */
export function openMeteo(): RainChanceSource {
  return httpOpenMeteo();
}
