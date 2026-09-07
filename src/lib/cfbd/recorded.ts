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
  CfbdScoreboardGame,
  CfbdTeamRecord,
  CfbdTeamStat,
  CfbdVenue,
} from "./types";

/**
 * One recorded response per client method, derived from the client itself so a
 * new endpoint cannot be added to the contract and forgotten here.
 */
export type Recording = { [K in keyof CfbdClient]: Awaited<ReturnType<CfbdClient[K]>> };

/**
 * The scoreboard as it would stand on the Saturday morning of a recorded
 * week: every game of the week, none started. Derived rather than recorded,
 * because `/scoreboard` has no week parameter and shows only the week being
 * played — it cannot be recorded for Week 2 until Week 2, and by then the
 * fixture would carry one moment's scores rather than a base to overlay. The
 * field shape is the live endpoint's, checked against a real response on
 * 2026-09-07 (see `CfbdScoreboardGame`); `name` there carries the mascot,
 * which this cannot know and does not fake.
 */
export function scoreboardOf(feedGames: CfbdGame[]): CfbdScoreboardGame[] {
  return feedGames.map((g) => ({
    id: g.id,
    startDate: g.startDate,
    startTimeTBD: g.startTimeTBD,
    tv: null,
    neutralSite: g.neutralSite,
    conferenceGame: g.conferenceGame,
    status: "scheduled",
    period: null,
    clock: null,
    situation: null,
    possession: null,
    lastPlay: null,
    homeTeam: {
      id: g.homeId,
      name: g.homeTeam,
      conference: g.homeConference,
      classification: g.homeClassification,
      points: null,
      lineScores: null,
      winProbability: null,
    },
    awayTeam: {
      id: g.awayId,
      name: g.awayTeam,
      conference: g.awayConference,
      classification: g.awayClassification,
      points: null,
      lineScores: null,
      winProbability: null,
    },
  }));
}

/**
 * Responses recorded from the live API with the project key. Rankings hold
 * the season's poll weeks so far; other-division polls were dropped. The
 * season-wide responses (records, stats, season games, venues) are trimmed
 * to the teams and venues that appear in the week's games. The scoreboard is
 * the one derived entry, for the reason on `scoreboardOf`.
 */
export const recordings = {
  "2026-week-2": {
    games: games2026w2 as CfbdGame[],
    scoreboard: scoreboardOf(games2026w2 as CfbdGame[]),
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

export interface RecordedCfbd extends CfbdClient {
  /**
   * How many feed reads this client has answered. Recorded responses are free,
   * so nothing else in a test would notice a caller asking for the same
   * endpoint twice — against the live client that is quota, monthly and small.
   */
  readonly calls: number;
}

/**
 * A client that replays a recording. `overrides` lets a test change what the
 * feed says next (a moved kickoff, say) without touching the fixture files.
 */
export function recordedCfbd(name: RecordingName, overrides: Partial<Recording> = {}): RecordedCfbd {
  const recording = { ...recordings[name], ...overrides };
  let calls = 0;
  const replay =
    <K extends keyof Recording>(key: K) =>
    async () => {
      calls += 1;
      return recording[key];
    };
  return {
    games: replay("games"),
    scoreboard: replay("scoreboard"),
    rankings: replay("rankings"),
    lines: replay("lines"),
    seasonGames: replay("seasonGames"),
    records: replay("records"),
    teamStats: replay("teamStats"),
    media: replay("media"),
    pregameWinProbability: replay("pregameWinProbability"),
    venues: replay("venues"),
    weather: replay("weather"),
    get calls() {
      return calls;
    },
  };
}
