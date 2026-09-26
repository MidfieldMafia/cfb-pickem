import gamePlayerStats2026w2 from "./fixtures/2026-week-2/game-player-stats.json";
import gameTeamStats2026w2 from "./fixtures/2026-week-2/game-team-stats.json";
import games2026w2 from "./fixtures/2026-week-2/games.json";
import lines2026w2 from "./fixtures/2026-week-2/lines.json";
import media2026w2 from "./fixtures/2026-week-2/media.json";
import rankings2026 from "./fixtures/2026-week-2/rankings.json";
import records2026 from "./fixtures/2026-week-2/records.json";
import roster2026 from "./fixtures/2026-week-2/roster.json";
import seasonGames2026 from "./fixtures/2026-week-2/season-games.json";
import stats2026 from "./fixtures/2026-week-2/stats.json";
import venues from "./fixtures/2026-week-2/venues.json";
import weather2026w2 from "./fixtures/2026-week-2/weather.json";
import wp2026w2 from "./fixtures/2026-week-2/win-probability.json";
import libertyAtCoastalFinal from "./fixtures/live-plays/401869941-final.json";
import libertyAtCoastalQ2 from "./fixtures/live-plays/401869941-q2.json";
import type {
  CfbdBettingGame,
  CfbdClient,
  CfbdGame,
  CfbdGameMedia,
  CfbdGamePlayerStats,
  CfbdGameTeamStats,
  CfbdGameWeather,
  CfbdLiveGame,
  CfbdPollWeek,
  CfbdPregameWinProbability,
  CfbdRosterPlayer,
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
 * GET /live/plays recorded mid-game: Liberty at Coastal Carolina, Q2 10:27 on
 * 2026-09-25, trimmed to the drive in progress and its last four plays. Not a
 * Week 2 game — no Week 2 play-by-play was ever recorded — so a suite that
 * puts it on a slate game says so, and nothing replays it by default.
 */
export const LIBERTY_AT_COASTAL_Q2 = libertyAtCoastalQ2 as CfbdLiveGame;

/**
 * The same game's whole feed at the final whistle, all 181 plays, from
 * docs/research/cfbd-live-plays/. Liberty (2335) is away, Coastal Carolina
 * (324) home; the text calls them LIB and CCU.
 */
export const LIBERTY_AT_COASTAL_FINAL = libertyAtCoastalFinal as CfbdLiveGame;

/**
 * What `/live/plays` has for a game with nothing logged yet: the header and no
 * drives. The default replay, so a suite that puts a game in play without
 * saying what its feed carries sees a game the feed has no plays for.
 */
export function noPlays(gameId: number): CfbdLiveGame {
  return {
    id: gameId,
    status: "In Progress",
    period: null,
    clock: "",
    possession: "",
    down: null,
    distance: null,
    yardsToGoal: null,
    teams: [],
    drives: [],
  };
}

/**
 * Responses recorded from the live API with the project key. Rankings hold
 * the season's poll weeks so far; other-division polls were dropped. The
 * season-wide responses (records, stats, season games, venues) are trimmed
 * to the teams and venues that appear in the week's games. The scoreboard is
 * the one derived entry, for the reason on `scoreboardOf`.
 *
 * The box scores were recorded on 2026-09-25, after the week was played, for
 * the three games the test Slate uses (Oklahoma at Michigan, Ohio State at
 * Texas, Florida A&M at Miami), and the roster is trimmed to the players in
 * them. So the week's games and scoreboard say nothing is final while its box
 * scores are all in: a suite that finishes a game says so with `feedWith`.
 */
export const recordings = {
  "2026-week-2": {
    games: games2026w2 as CfbdGame[],
    scoreboard: scoreboardOf(games2026w2 as CfbdGame[]),
    livePlays: noPlays(0),
    gameTeamStats: gameTeamStats2026w2 as CfbdGameTeamStats[],
    gamePlayerStats: gamePlayerStats2026w2 as CfbdGamePlayerStats[],
    roster: roster2026 as CfbdRosterPlayer[],
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
    // The one replay that reads its argument: a game's plays are its own, and
    // the default recording carries none, so the answer is for the game asked.
    livePlays: async (gameId) => {
      calls += 1;
      const recorded = recording.livePlays;
      return recorded.drives.length === 0 ? noPlays(gameId) : recorded;
    },
    gameTeamStats: replay("gameTeamStats"),
    gamePlayerStats: replay("gamePlayerStats"),
    roster: replay("roster"),
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
