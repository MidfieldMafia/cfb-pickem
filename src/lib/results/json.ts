/**
 * The graded Week and season in the shape the screens hold: the Reveal, the
 * Weekly Scores, the Weekly Win and the Leaderboard. `./results` builds them;
 * the Live Board, the Game sheet and the Leaderboard render them, several from
 * `"use client"` files. Client-safe, so nothing here may reach the database:
 * a value import added to `./results` from a client file would pull the
 * server-only grading in with it, and only `next build` would say so.
 */
import type * as engine from "@/lib/scoring/types";
import type { GameView, MemberJson, WeekJson } from "@/lib/slate/json";

/**
 * A member as every graded screen names them. The Reveal, the Weekly Score
 * and the Leaderboard all carry the whole chip rather than an id, so a screen
 * renders a row without holding a second map to look the name up in.
 *
 * `MemberJson` under another name: the graded screens and the plain ones show
 * the same chip, and two shapes for it would drift.
 */
export type ScoredMember = MemberJson;

export interface RevealPick {
  memberId: number;
  teamId: number;
  outcome: engine.PickOutcome;
  /**
   * The member's Lock of the Week on this pick: `"counts"` while it earns the
   * multiplier, `"dropped"` once the Game is Void — a Dropped Lock — and null
   * when their Lock is elsewhere or unset. The board shows a Dropped Lock so a
   * member who spent theirs here is not mistaken for one who set none.
   *
   * One field rather than two booleans, because "counting" and "dropped" are
   * exclusive and a pair could say both. That exclusion used to rest on
   * `score-week` clearing `locked` in its void branch, three modules from the
   * board that promised it; here it cannot be expressed.
   */
  lock: "counts" | "dropped" | null;
  /** What this pick scored: 0 unless the game is final and the pick is correct. Carries the Lock multiplier already applied. */
  points: number;
}

/** The Game, its result, and who took which side: the shared pair plus the board's own column. */
export interface RevealGame extends GameView {
  /** One entry per member who picked this game, in member order. */
  picks: RevealPick[];
}

/** Everyone's picks per game after the Deadline, graded by the scoring engine where the game is final. */
export interface Reveal {
  week: WeekJson;
  year: number;
  members: ScoredMember[];
  games: RevealGame[];
}

/*
 * From here down the module says the same words as `@/lib/scoring/types` —
 * Weekly Score, Weekly Win, Leaderboard, from GLOSSARY.md — in database ids
 * rather than the engine's strings. Two spellings of one vocabulary is the
 * point of an adapter; screens import these, and only this module and
 * `engine.ts` ever see the engine's.
 */

/**
 * One member's Weekly Score. The per-pick breakdown is not repeated here: it
 * is the Reveal's `games`, the same grading transposed, and a Weekly Score
 * that carried its own copy could drift from the board beside it.
 */
export interface WeeklyScore {
  member: ScoredMember;
  /**
   * Whether the Week counts for this member: a Played Week. False for someone
   * who was on the board and made no Pick — they show here at zero so the week
   * says they sat it out, and the season ignores the row entirely.
   */
  played: boolean;
  /** 1-based place in the Week, from the engine; members level on everything share one. */
  place: number;
  points: number;
  /**
   * The most the member can still finish the Week on, if every Pick still
   * pending comes in: the engine's `maxPoints`. Equals `points` once the Week
   * is complete.
   */
  maxPoints: number;
  correct: number;
  incorrect: number;
  /** Picks on games that are not final yet: what is still to play for. */
  pending: number;
  /** The Game carrying the member's Lock of the Week, or null if they set none. */
  lockGameId: number | null;
  /** The Lock sat on a Void game and was released: a Dropped Lock. */
  lockDropped: boolean;
  tiebreakerGuess: number | null;
  /** Absolute error against the Tiebreaker Game's combined final score; null until it is final. */
  tiebreakerError: number | null;
}

export interface WeeklyWin {
  winners: ScoredMember[];
  points: number;
  decidedBy: engine.WeeklyWinDecidedBy;
  /**
   * Tied for the lead on points, in finish order; empty when one member led
   * outright, or the Week has no Tiebreaker Game a Guess could be measured
   * against. See the engine's `WeeklyWin.contenders`.
   */
  contenders: ScoredMember[];
}

export interface LeaderboardRow {
  member: ScoredMember;
  /** 1-based; members that tie on every season tiebreak share a rank. */
  rank: number;
  /** The place this rank moved from; null when there is no earlier board to have held one on. */
  previousRank: number | null;
  totalPoints: number;
  correct: number;
  incorrect: number;
  weeklyWins: number;
  weeksPlayed: number;
  averagePoints: number | null;
  cumulativeTiebreakerError: number;
  /** Mean absolute Tiebreaker Guess miss over weeks actually guessed. Display-only; lower is better. */
  averageTiebreakerMiss: number | null;
}
