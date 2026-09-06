/**
 * Presentation detail for a Game on the pick screen: where and when it is
 * played, who carries it, the pregame win probability, the forecast, and
 * each team's form so far. Joined to a Game by CollegeFootballData id and
 * snapshotted onto the slate; the scoring engine never reads any of it.
 */
import type { CfbdClient, CfbdGame, WeekQuery } from "./types";

/** One team's season so far. Averages are per game played; null before the first game. */
export interface TeamForm {
  /** "2–0" with an en dash. */
  record: string;
  pointsFor: number | null;
  pointsAgainst: number | null;
  yardsFor: number | null;
  yardsAgainst: number | null;
}

export interface GameWeather {
  /** Degrees Fahrenheit. */
  temperature: number;
  /** Inches. */
  precipitation: number;
  /** Miles per hour. */
  windSpeed: number;
  conditionCode: number | null;
  condition: string | null;
  indoors: boolean;
}

export interface GameDetail {
  venue: string | null;
  /** "Ann Arbor, MI". */
  city: string | null;
  /** The first television outlet, or null when unannounced. */
  tv: string | null;
  /** Pregame win probability for the home team, 0 to 1. */
  homeWinProbability: number | null;
  /** Points, home perspective: negative when the home team is favored. */
  homeSpread: number | null;
  weather: GameWeather | null;
  home: TeamForm;
  away: TeamForm;
}

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

export async function weekDetails(cfbd: CfbdClient, query: WeekQuery): Promise<Map<number, GameDetail>> {
  const [games, seasonGames, records, stats, media, winProbability, venues, weather] = await Promise.all([
    cfbd.games(query),
    cfbd.seasonGames(query.year),
    cfbd.records(query.year),
    cfbd.teamStats(query.year),
    cfbd.media(query),
    cfbd.pregameWinProbability(query),
    cfbd.venues(),
    cfbd.weather(query),
  ]);

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

  const form = (teamId: number, team: string): TeamForm => {
    const record = recordByTeam.get(teamId);
    const tally = points.get(teamId);
    const teamStats = statsByTeam.get(team);
    const played = teamStats?.get("games");
    return {
      record: record ? `${record.wins}–${record.losses}${record.ties ? `–${record.ties}` : ""}` : "0–0",
      pointsFor: tally ? round1(tally.pointsFor / tally.games) : null,
      pointsAgainst: tally ? round1(tally.pointsAgainst / tally.games) : null,
      yardsFor: average(teamStats?.get("totalYards"), played),
      yardsAgainst: average(teamStats?.get("totalYardsOpponent"), played),
    };
  };

  const details = new Map<number, GameDetail>();
  for (const game of games) {
    const venue = game.venueId === null ? undefined : venueById.get(game.venueId);
    const wp = wpByGame.get(game.id);
    const w = weatherByGame.get(game.id);
    details.set(game.id, {
      venue: game.venue ?? venue?.name ?? null,
      city: venue?.city ? (venue.state ? `${venue.city}, ${venue.state}` : venue.city) : null,
      tv: tvByGame.get(game.id) ?? null,
      homeWinProbability: wp?.homeWinProbability ?? null,
      homeSpread: wp?.spread ?? null,
      weather:
        w && w.temperature !== null
          ? {
              temperature: w.temperature,
              precipitation: w.precipitation ?? 0,
              windSpeed: w.windSpeed ?? 0,
              conditionCode: w.weatherConditionCode,
              condition: w.weatherCondition,
              indoors: w.gameIndoors ?? false,
            }
          : null,
      home: form(game.homeId, game.homeTeam),
      away: form(game.awayId, game.awayTeam),
    });
  }
  return details;
}
