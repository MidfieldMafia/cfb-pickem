/**
 * Scoring engine types. Plain data in, plain data out. Vocabulary follows
 * CONTEXT.md: Member, Rules, Week, Game, Pick, Lock of the Week,
 * Tiebreaker Guess, Void, Weekly Score, Weekly Win, Leaderboard.
 *
 * Timestamps are ISO 8601 strings in UTC. The engine never reads a clock;
 * callers decide which weeks to pass in.
 */

export type MemberId = string;
export type GameId = string;
export type TeamId = string;

/** Scoring parameters for a season. Inputs to scoring, never baked into totals. */
export interface Rules {
  /** Points for a correct pick. 10 in 2026. */
  pointsPerCorrectPick: number;
  /** Multiplier applied to a correct Lock of the Week. 2 in 2026 (20 points). */
  lockMultiplier: number;
}

export interface Member {
  id: MemberId;
  /** When the member was added. A week counts as played only if its Deadline fell after this. */
  joinedAt: string;
}

export type GameStatus = "scheduled" | "in_progress" | "final";

/**
 * One matchup on a slate, with its effective result. Result Overrides are
 * applied by the caller before the game reaches the engine.
 */
export interface Game {
  id: GameId;
  homeTeam: TeamId;
  awayTeam: TeamId;
  homeScore: number | null;
  awayScore: number | null;
  status: GameStatus;
  /** Canceled or postponed after publish: scores 0 for everyone, drops any Lock on it. */
  void: boolean;
}

export interface Pick {
  memberId: MemberId;
  gameId: GameId;
  team: TeamId;
}

/** A member's Lock of the Week: the one pick marked for the multiplier. */
export interface Lock {
  memberId: MemberId;
  gameId: GameId;
}

export interface TiebreakerGuess {
  memberId: MemberId;
  /** Predicted combined final score of the Tiebreaker Game. */
  guess: number;
}

export interface Week {
  weekNumber: number;
  /** ISO 8601 UTC instant the week's picks lock. */
  deadline: string;
  published: boolean;
  tiebreakerGameId: GameId | null;
  games: Game[];
  picks: Pick[];
  locks: Lock[];
  tiebreakerGuesses: TiebreakerGuess[];
}

export type PickOutcome =
  | "correct"
  | "incorrect"
  /** Game not yet final. Contributes nothing; shown provisionally on the Live Board. */
  | "pending"
  | "void"
  | "unpicked";

export interface PickResult {
  gameId: GameId;
  team: TeamId | null;
  outcome: PickOutcome;
  /** True when the Lock of the Week applies to this pick (not dropped by a Void). */
  locked: boolean;
  points: number;
}

export interface LockResult {
  gameId: GameId;
  /** True when the Lock sat on a Void game and was released. */
  dropped: boolean;
}

export interface WeeklyScore {
  memberId: MemberId;
  points: number;
  correct: number;
  incorrect: number;
  pending: number;
  picks: PickResult[];
  lock: LockResult | null;
  tiebreakerGuess: number | null;
  /**
   * Absolute error of the Tiebreaker Guess against the Tiebreaker Game's
   * combined final score. Null until that game is final. A missing guess
   * counts as a guess of 0.
   */
  tiebreakerError: number | null;
}

export type WeeklyWinDecidedBy = "points" | "tiebreaker" | "shared";

export interface WeeklyWin {
  winners: MemberId[];
  points: number;
  decidedBy: WeeklyWinDecidedBy;
}

export interface WeekResult {
  weekNumber: number;
  /** Every non-void game is final. Weekly Wins count toward the season only when true. */
  complete: boolean;
  /** Members who played the week (joined before the Deadline), sorted by points then tiebreaker error. */
  scores: WeeklyScore[];
  /** Null when nobody played the week. */
  weeklyWin: WeeklyWin | null;
}

export interface LeaderboardRow {
  memberId: MemberId;
  /** 1-based; members that tie on every season tiebreak share a rank. */
  rank: number;
  totalPoints: number;
  correct: number;
  incorrect: number;
  weeklyWins: number;
  /** Published weeks whose Deadline fell after the member joined. */
  weeksPlayed: number;
  /** Total points divided by weeks played; null before the first week played. */
  averagePoints: number | null;
  /** Sum of tiebreaker errors over completed weeks played. */
  cumulativeTiebreakerError: number;
}

export interface SeasonResult {
  weeks: WeekResult[];
  leaderboard: LeaderboardRow[];
}
