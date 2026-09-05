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
}
