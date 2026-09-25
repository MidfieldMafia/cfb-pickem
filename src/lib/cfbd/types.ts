/**
 * The slice of CollegeFootballData's v2 API that Saturday Slate reads.
 * Field names match the live OpenAPI spec (see docs/research/collegefootballdata-api.md).
 * Numeric ids are the only identity; school names are display text.
 */

export interface CfbdGame {
  id: number;
  season: number;
  week: number;
  seasonType: string;
  /** ISO 8601 kickoff. */
  startDate: string;
  startTimeTBD: boolean;
  completed: boolean;
  neutralSite: boolean;
  conferenceGame: boolean;
  venueId: number | null;
  venue: string | null;
  homeId: number;
  homeTeam: string;
  homeClassification: string | null;
  homeConference: string | null;
  homePoints: number | null;
  awayId: number;
  awayTeam: string;
  awayClassification: string | null;
  awayConference: string | null;
  awayPoints: number | null;
}

export interface CfbdPollRank {
  rank: number | null;
  teamId: number;
  school: string;
  conference: string | null;
}

export interface CfbdPoll {
  poll: string;
  ranks: CfbdPollRank[];
}

export interface CfbdPollWeek {
  season: number;
  seasonType: string;
  week: number;
  polls: CfbdPoll[];
}

export interface CfbdLine {
  provider: string;
  spread: number | null;
  /** e.g. "Texas -1.5", from the favorite's perspective. */
  formattedSpread: string | null;
  overUnder: number | null;
}

export interface CfbdBettingGame {
  id: number;
  homeTeamId: number;
  awayTeamId: number;
  lines: CfbdLine[];
}

export interface CfbdRecordSplit {
  games: number;
  wins: number;
  losses: number;
  ties: number;
}

/** GET /records: one row per team per season. */
export interface CfbdTeamRecord {
  year: number;
  teamId: number;
  team: string;
  total: CfbdRecordSplit;
}

/** GET /stats/season: one row per team per stat. Keyed by school name; the endpoint carries no team id. */
export interface CfbdTeamStat {
  season: number;
  team: string;
  statName: string;
  statValue: number;
}

/** GET /games/media: one row per game per outlet. */
export interface CfbdGameMedia {
  id: number;
  mediaType: string;
  outlet: string;
}

/** GET /metrics/wp/pregame: one row per game. Spread is from the home team's perspective. */
export interface CfbdPregameWinProbability {
  gameId: number;
  spread: number | null;
  homeWinProbability: number;
}

/** GET /venues. */
export interface CfbdVenue {
  id: number;
  name: string;
  city: string | null;
  state: string | null;
  dome: boolean | null;
  /** IANA zone, e.g. "America/Detroit"; null for a few small venues. */
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** GET /games/weather: the forecast (or observation) for one game. Paid tier. */
export interface CfbdGameWeather {
  id: number;
  gameIndoors: boolean | null;
  /** Degrees Fahrenheit. */
  temperature: number | null;
  /** Inches. */
  precipitation: number | null;
  /** Miles per hour. */
  windSpeed: number | null;
  weatherConditionCode: number | null;
  weatherCondition: string | null;
}

/**
 * The only three words the scoreboard has for a game. There is no postponed or
 * canceled: a game that never starts stays `scheduled`, which is why a
 * commissioner is asked to look at anything still pending hours after kickoff.
 */
export type CfbdScoreboardStatus = "scheduled" | "in_progress" | "completed";

/** One side of a scoreboard game. `name` carries the mascot ("TCU Horned Frogs"), unlike `/games`; join on `id`. */
export interface CfbdScoreboardTeam {
  id: number;
  name: string;
  conference: string | null;
  classification: string | null;
  /** Null before kickoff. */
  points: number | null;
  lineScores: number[] | null;
  winProbability: number | null;
}

/**
 * GET /scoreboard: every game in the current week's window, whatever its
 * state, in one call. Recorded 2026-09-07 the shape carried the Week 1 board,
 * finals from the previous Saturday through that Monday night's game, and none
 * of Week 2 — so the board is the week being played, not a rolling window, and
 * a game can be missing from it either side of its own week.
 */
export interface CfbdScoreboardGame {
  id: number;
  /** ISO 8601 kickoff. */
  startDate: string;
  startTimeTBD: boolean;
  tv: string | null;
  neutralSite: boolean;
  conferenceGame: boolean;
  status: CfbdScoreboardStatus;
  /** The quarter, 5 and up for overtime. Null before kickoff and once final. */
  period: number | null;
  /** "08:42". Null before kickoff and once final. */
  clock: string | null;
  situation: string | null;
  possession: string | null;
  lastPlay: string | null;
  homeTeam: CfbdScoreboardTeam;
  awayTeam: CfbdScoreboardTeam;
}

/**
 * One play in GET /live/plays. `homeScore`/`awayScore` are the score *after*
 * the play, extra point included; `clock` is the game clock after it, "3:05"
 * with no leading zero; `wallClock` is when the play was logged upstream, not
 * when it was snapped, and it moves when the play is revised in place.
 * `yardsToGoal` is the play's start spot, measured from `teamId`, which is the
 * offense on a snap and the kicking team on a kick. See
 * docs/research/cfbd-live-plays.md.
 */
export interface CfbdLivePlay {
  id: string;
  homeScore: number;
  awayScore: number;
  period: number;
  clock: string;
  /** ISO 8601. */
  wallClock: string;
  teamId: number;
  team: string;
  down: number | null;
  distance: number | null;
  yardsToGoal: number | null;
  yardsGained: number | null;
  playTypeId: number;
  playType: string;
  epa: number | null;
  garbageTime: boolean;
  success: boolean;
  rushPass: string;
  downType: string;
  playText: string;
}

/** One drive in GET /live/plays. Its `plays` start with the kickoff or punt that began it. The metadata is loose; never draw from it. */
export interface CfbdLiveDrive {
  id: string;
  offenseId: number;
  offense: string;
  defenseId: number;
  defense: string;
  playCount: number;
  yards: number;
  startPeriod: number | null;
  startClock: string | null;
  startYardsToGoal: number | null;
  endPeriod: number | null;
  endClock: string | null;
  endYardsToGoal: number | null;
  duration: string | null;
  scoringOpportunity: boolean;
  result: string;
  pointsGained: number;
  plays: CfbdLivePlay[];
}

/**
 * GET /live/plays for one game: the whole game so far in one response, every
 * drive with its plays, never incremental. The header's `down`, `distance`
 * and `yardsToGoal` are the end state of the newest play; its `possession` is
 * a team *name*, and the team that ran the newest play, so it is the kicking
 * team after a kick. `teams[]` carries CFBD's advanced metrics, which nothing
 * here reads.
 */
export interface CfbdLiveGame {
  id: number;
  /** Title-case prose: "In Progress", "End of Period", "Halftime", "Final". */
  status: string;
  period: number | null;
  clock: string;
  possession: string;
  /** 1–4; 0 after a timeout, -1 after a touchdown, null once final. */
  down: number | null;
  distance: number | null;
  yardsToGoal: number | null;
  teams: unknown[];
  drives: CfbdLiveDrive[];
}

export interface WeekQuery {
  year: number;
  week: number;
}

/**
 * The seam between Saturday Slate and CollegeFootballData. Production talks
 * HTTP; tests replay recorded responses. One method per endpoint.
 */
export interface CfbdClient {
  /** GET /games for a regular-season week, FBS classification. */
  games(query: WeekQuery): Promise<CfbdGame[]>;
  /**
   * GET /scoreboard, FBS classification: the week being played, live. The one
   * call the Saturday refresh makes, and the one read nothing caches — the
   * stale gate on `weeks.scoreboard_fetched_at` is its whole bound.
   */
  scoreboard(): Promise<CfbdScoreboardGame[]>;
  /**
   * GET /live/plays for one game. Metered per call, a 304 included, so the
   * stale gate's claim is its one caller: see `ingestResults`.
   */
  livePlays(gameId: number): Promise<CfbdLiveGame>;
  /** GET /rankings for a season: every poll week published so far. */
  rankings(year: number): Promise<CfbdPollWeek[]>;
  /** GET /lines for a regular-season week. */
  lines(query: WeekQuery): Promise<CfbdBettingGame[]>;
  /** GET /games for the whole regular season, FBS classification: the source of points for and against. */
  seasonGames(year: number): Promise<CfbdGame[]>;
  /** GET /records for a season. */
  records(year: number): Promise<CfbdTeamRecord[]>;
  /** GET /stats/season for a season. */
  teamStats(year: number): Promise<CfbdTeamStat[]>;
  /** GET /games/media for a regular-season week. */
  media(query: WeekQuery): Promise<CfbdGameMedia[]>;
  /** GET /metrics/wp/pregame for a regular-season week. */
  pregameWinProbability(query: WeekQuery): Promise<CfbdPregameWinProbability[]>;
  /** GET /venues: every venue the API knows. */
  venues(): Promise<CfbdVenue[]>;
  /** GET /games/weather for a regular-season week. */
  weather(query: WeekQuery): Promise<CfbdGameWeather[]>;
}
