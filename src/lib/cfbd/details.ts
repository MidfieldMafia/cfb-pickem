/**
 * Presentation detail for a Game on the pick screen: where and when it is
 * played, who carries it, the line and the pregame win probability, the
 * forecast, and each team's form so far. Produces the `GameDetail` shape the
 * screens consume, joined to a Game by CollegeFootballData id and snapshotted
 * onto the slate; the scoring engine never reads any of it.
 */
import { hourIn } from "@/lib/intl-time";
import type { GameDetail, SkyIcon, TeamDetail, Weather } from "@/lib/scoring/types";
import type { RainChanceSource } from "@/lib/weather/open-meteo";
import { rankLookup } from "./rankings";
import type { CfbdBettingGame, CfbdClient, CfbdGame, CfbdGameWeather, CfbdVenue, WeekQuery } from "./types";

const round1 = (n: number) => Math.round(n * 10) / 10;

function average(total: number | undefined, games: number | undefined): number | null {
  if (total === undefined || !games) return null;
  return round1(total / games);
}

interface Tally {
  games: number;
  pointsFor: number;
  pointsAgainst: number;
}

/** Points for and against per team, from every completed game in the season feed. */
function pointsByTeam(seasonGames: CfbdGame[]): Map<number, Tally> {
  const tallies = new Map<number, Tally>();
  const add = (teamId: number, scored: number, allowed: number) => {
    const t = tallies.get(teamId) ?? { games: 0, pointsFor: 0, pointsAgainst: 0 };
    t.games += 1;
    t.pointsFor += scored;
    t.pointsAgainst += allowed;
    tallies.set(teamId, t);
  };
  for (const game of seasonGames) {
    if (!game.completed || game.homePoints === null || game.awayPoints === null) continue;
    add(game.homeId, game.homePoints, game.awayPoints);
    add(game.awayId, game.awayPoints, game.homePoints);
  }
  return tallies;
}

/**
 * The line the first sportsbook posted for each game, preferring the feed's own
 * formatting. Shared with `weekCandidates`, which shows it on the slate builder.
 */
export function bookLines(betting: CfbdBettingGame[]): Map<number, string> {
  const lines = new Map<number, string>();
  for (const b of betting) {
    const line = b.lines.find((l) => l.spread !== null);
    if (line) lines.set(b.id, line.formattedSpread ?? `${line.spread}`);
  }
  return lines;
}

/**
 * Lucide icon for the sky. CollegeFootballData condition codes seen in the
 * feed: 1 clear, 2 fair, 3 cloudy, 7 light rain, 8 rain, 18 heavy rain shower,
 * 25 thunderstorm; 0 with no text means unknown, so the chance of rain decides.
 */
export function skyIcon(code: number | null, rainChance: number | null, night: boolean): SkyIcon {
  switch (code) {
    case 1:
      return night ? "moon" : "sun";
    case 2:
      return night ? "moon" : "cloud-sun";
    case 3:
      return "cloud";
    case 7:
      return "cloud-sun-rain";
    case 8:
    case 18:
    case 25:
      return "cloud-rain";
    default:
      if (rainChance !== null && rainChance >= 50) return "cloud-rain";
      if (rainChance !== null && rainChance >= 20) return "cloud-sun-rain";
      return night ? "moon" : "cloud-sun";
  }
}

function toWeather(
  w: CfbdGameWeather | undefined,
  rainChance: number | null,
  kickoff: Date,
  venue: CfbdVenue | undefined,
): Weather | null {
  if (!w || w.temperature === null || w.gameIndoors) return null;
  const hour = hourIn(kickoff, venue?.timezone ?? "UTC");
  const night = hour >= 19 || hour < 6;
  return {
    temperature: Math.round(w.temperature),
    precipitation: rainChance,
    icon: skyIcon(w.weatherConditionCode, rainChance, night),
    wind: Math.round(w.windSpeed ?? 0),
  };
}

/** "Oklahoma -1.5" from the sportsbooks, else from the win-probability model's spread, else "Pick". */
function spreadText(
  game: CfbdGame,
  lines: Map<number, string>,
  modelSpread: number | null | undefined,
): string {
  const line = lines.get(game.id);
  if (line) return line;
  if (modelSpread === null || modelSpread === undefined || modelSpread === 0) return "Pick";
  const favorite = modelSpread < 0 ? game.homeTeam : game.awayTeam;
  return `${favorite} -${Math.abs(modelSpread)}`;
}

export async function weekDetails(
  cfbd: CfbdClient,
  rain: RainChanceSource,
  query: WeekQuery,
): Promise<Map<number, GameDetail>> {
  const [games, pollWeeks, betting, seasonGames, records, stats, media, winProbability, venues, weather] =
    await Promise.all([
      cfbd.games(query),
      cfbd.rankings(query.year),
      cfbd.lines(query),
      cfbd.seasonGames(query.year),
      cfbd.records(query.year),
      cfbd.teamStats(query.year),
      cfbd.media(query),
      cfbd.pregameWinProbability(query),
      cfbd.venues(),
      cfbd.weather(query),
    ]);

  const ranks = rankLookup(pollWeeks, query.week);
  const lines = bookLines(betting);
  const recordByTeam = new Map(records.map((r) => [r.teamId, r.total]));
  const statsByTeam = new Map<string, Map<string, number>>();
  for (const s of stats) {
    let byName = statsByTeam.get(s.team);
    if (!byName) statsByTeam.set(s.team, (byName = new Map()));
    byName.set(s.statName, s.statValue);
  }
  const points = pointsByTeam(seasonGames);
  const tvByGame = new Map<number, string>();
  for (const m of media) if (m.mediaType === "tv" && !tvByGame.has(m.id)) tvByGame.set(m.id, m.outlet);
  const wpByGame = new Map(winProbability.map((w) => [w.gameId, w]));
  const venueById = new Map(venues.map((v) => [v.id, v]));
  const weatherByGame = new Map(weather.map((w) => [w.id, w]));

  // One Open-Meteo call for the whole week: every outdoor venue at its kickoff hour.
  const located = games
    .map((game) => ({ game, venue: game.venueId === null ? undefined : venueById.get(game.venueId) }))
    .filter(({ venue }) => venue && venue.latitude !== null && venue.longitude !== null);
  const chances = await rain.rainChance(
    located.map(({ game, venue }) => ({
      latitude: venue!.latitude!,
      longitude: venue!.longitude!,
      at: new Date(game.startDate),
    })),
  );
  const rainByGame = new Map(located.map(({ game }, i) => [game.id, chances[i] ?? null]));

  const form = (teamId: number, team: string): TeamDetail => {
    const record = recordByTeam.get(teamId);
    const tally = points.get(teamId);
    const teamStats = statsByTeam.get(team);
    const played = teamStats?.get("games");
    return {
      rank: ranks.get(teamId) ?? null,
      record: record ? `${record.wins}–${record.losses}${record.ties ? `–${record.ties}` : ""}` : "0–0",
      pointsFor: average(tally?.pointsFor, tally?.games),
      pointsAgainst: average(tally?.pointsAgainst, tally?.games),
      yardsFor: average(teamStats?.get("totalYards"), played),
      yardsAgainst: average(teamStats?.get("totalYardsOpponent"), played),
    };
  };

  const details = new Map<number, GameDetail>();
  for (const game of games) {
    const venue = game.venueId === null ? undefined : venueById.get(game.venueId);
    const wp = wpByGame.get(game.id);
    const kickoff = new Date(game.startDate);
    details.set(game.id, {
      gameId: String(game.id),
      kickoff: kickoff.toISOString(),
      venue: game.venue ?? venue?.name ?? "",
      city: venue?.city ? (venue.state ? `${venue.city}, ${venue.state}` : venue.city) : "",
      tv: tvByGame.get(game.id) ?? null,
      homeWp: wp?.homeWinProbability ?? null,
      spread: spreadText(game, lines, wp?.spread),
      weather: toWeather(weatherByGame.get(game.id), rainByGame.get(game.id) ?? null, kickoff, venue),
      home: form(game.homeId, game.homeTeam),
      away: form(game.awayId, game.awayTeam),
    });
  }
  return details;
}
