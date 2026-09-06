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
