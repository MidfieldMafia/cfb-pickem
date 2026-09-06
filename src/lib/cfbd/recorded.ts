import games2026w2 from "./fixtures/2026-week-2/games.json";
import lines2026w2 from "./fixtures/2026-week-2/lines.json";
import media2026w2 from "./fixtures/2026-week-2/media.json";
import rankings2026 from "./fixtures/2026-week-2/rankings.json";
import records2026 from "./fixtures/2026-week-2/records.json";
import seasonGames2026 from "./fixtures/2026-week-2/season-games.json";
import stats2026 from "./fixtures/2026-week-2/stats.json";
import venues from "./fixtures/2026-week-2/venues.json";
import weather2026w2 from "./fixtures/2026-week-2/weather.json";
import wp2026w2 from "./fixtures/2026-week-2/win-probability.json";
import type {
  CfbdBettingGame,
  CfbdClient,
  CfbdGame,
  CfbdGameMedia,
  CfbdGameWeather,
  CfbdPollWeek,
  CfbdPregameWinProbability,
  CfbdTeamRecord,
  CfbdTeamStat,
  CfbdVenue,
} from "./types";

export interface Recording {
  games: CfbdGame[];
  rankings: CfbdPollWeek[];
  lines: CfbdBettingGame[];
  seasonGames: CfbdGame[];
  records: CfbdTeamRecord[];
  teamStats: CfbdTeamStat[];
  media: CfbdGameMedia[];
  pregameWinProbability: CfbdPregameWinProbability[];
  venues: CfbdVenue[];
  weather: CfbdGameWeather[];
}

/**
 * Responses recorded from the live API with the project key. Rankings hold
 * the season's poll weeks so far; other-division polls were dropped. The
 * season-wide responses (records, stats, season games, venues) are trimmed
 * to the teams and venues that appear in the week's games.
 */
export const recordings = {
  "2026-week-2": {
    games: games2026w2 as CfbdGame[],
    rankings: rankings2026 as CfbdPollWeek[],
    lines: lines2026w2 as CfbdBettingGame[],
    seasonGames: seasonGames2026 as CfbdGame[],
    records: records2026 as CfbdTeamRecord[],
    teamStats: stats2026 as CfbdTeamStat[],
    media: media2026w2 as CfbdGameMedia[],
    pregameWinProbability: wp2026w2 as CfbdPregameWinProbability[],
    venues: venues as CfbdVenue[],
    weather: weather2026w2 as CfbdGameWeather[],
  },
} satisfies Record<string, Recording>;

export type RecordingName = keyof typeof recordings;

/**
 * A client that replays a recording. `overrides` lets a test change what the
 * feed says next (a moved kickoff, say) without touching the fixture files.
 */
export function recordedCfbd(name: RecordingName, overrides: Partial<Recording> = {}): CfbdClient {
  const recording = { ...recordings[name], ...overrides };
  return {
    games: async () => recording.games,
    rankings: async () => recording.rankings,
    lines: async () => recording.lines,
    seasonGames: async () => recording.seasonGames,
    records: async () => recording.records,
    teamStats: async () => recording.teamStats,
    media: async () => recording.media,
    pregameWinProbability: async () => recording.pregameWinProbability,
    venues: async () => recording.venues,
    weather: async () => recording.weather,
  };
}
