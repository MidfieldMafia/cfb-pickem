/**
 * What happened to a Game: the Void first, then the Result Override, then the
 * feed. One derivation, read by scoring, by the Reveal, and by both console
 * tables.
 *
 * Kept free of database imports, like `picks/progress.ts` and
 * `members/limits.ts`, so `slate/json.ts` can build a `GameView` without
 * dragging the Drizzle schema into a browser bundle. The audit log, which does
 * write rows, stays next door in `audit.ts`.
 */
import type { Game } from "@/db/schema";

export type ResultStatus = "pending" | "final" | "void";

/** Where a final score came from. Null while pending or void. */
export type ResultSource = "feed" | "override";

/** A home and away score pair. */
export interface Score {
  homeScore: number;
  awayScore: number;
}

/** The running score, and where in the game it stands. */
export interface LiveScore extends Score {
  /** The quarter, 5 and up for overtime. Null when the feed has not said. */
  period: number | null;
  /** "08:42", as the feed writes it. Null when the feed has not said. */
  clock: string | null;
}

/**
 * Where a game in progress stands, in the words a screen puts beside the
 * score: "Q3 · 8:12", "OT · 2:00", "2OT" once the clock is gone. Null when the
 * feed has given neither a period nor a clock, so a screen shows the label
 * alone rather than "Q · ". One spelling, for the console, the Reveal and the
 * Live Board alike.
 */
export function clockLabel(live: Pick<LiveScore, "period" | "clock">): string | null {
  const { period, clock } = live;
  const quarter = period === null ? null : period <= 4 ? `Q${period}` : period === 5 ? "OT" : `${period - 4}OT`;
  // The feed pads to "08:42"; the leading zero is noise beside a quarter.
  const time = clock === null ? null : clock.replace(/^0(\d:)/, "$1");
  if (quarter === null) return time;
  return time === null ? quarter : `${quarter} · ${time}`;
}

/** Every word a screen puts on a Game's state. One vocabulary, so the Reveal and the console agree. */
export type ResultLabel = "Scheduled" | "In progress" | "Final" | "Final · override" | "Void";

/**
 * A Game's result as scoring and screens see it. The whole answer, so no
 * screen re-derives part of it — `status`, `homeScore` and `awayScore` are
 * what counts, `live` is the running score that does not, `shown` is the pair
 * to put on screen whichever of those it came from, and `label` is what to
 * call it.
 */
export interface GameResult {
  status: ResultStatus;
  homeScore: number | null;
  awayScore: number | null;
  source: ResultSource | null;
  /**
   * The feed's running score and clock. Set only while pending and under way;
   * null once final, void, or before kickoff.
   */
  live: LiveScore | null;
  /**
   * The score to put on screen: the final where there is one, else the running
   * score, else null for a game with no numbers yet. A screen renders this or
   * its own dash, and never falls back from one field to another itself —
   * which is how the Reveal and the console came to disagree about the dash.
   */
  shown: Score | null;
  label: ResultLabel;
  /** Why a commissioner made it this: the Override's note, or the Void's. Null when the feed decided. */
  note: string | null;
  /**
   * What the feed itself says, when a Result Override stands over it — the
   * console shows the commissioner what they overrode. Null unless the source
   * is an override, and null then too when the feed has no final of its own.
   */
  feedFinal: Score | null;
}

/** `games_final_has_scores` makes a final row without scores impossible; the null checks are how TypeScript learns it. */
function feedFinalOf(game: Game): Score | null {
  return game.status === "final" && game.homeScore !== null && game.awayScore !== null
    ? { homeScore: game.homeScore, awayScore: game.awayScore }
    : null;
}

export function effectiveResult(game: Game): GameResult {
  if (game.void) {
    return {
      status: "void",
      homeScore: null,
      awayScore: null,
      source: null,
      live: null,
      shown: null,
      label: "Void",
      note: game.voidNote,
      feedFinal: null,
    };
  }
  if (game.overrideHomeScore !== null && game.overrideAwayScore !== null) {
    const override = { homeScore: game.overrideHomeScore, awayScore: game.overrideAwayScore };
    return {
      ...override,
      status: "final",
      source: "override",
      live: null,
      shown: override,
      label: "Final · override",
      note: game.overrideNote,
      feedFinal: feedFinalOf(game),
    };
  }
  const final = feedFinalOf(game);
  if (final) {
    return {
      ...final,
      status: "final",
      source: "feed",
      live: null,
      shown: final,
      label: "Final",
      note: null,
      feedFinal: null,
    };
  }
  // The feed only reports in_progress with a score, so one condition settles
  // both the running score and the word for it.
  const live: LiveScore | null =
    game.status === "in_progress" && game.homeScore !== null && game.awayScore !== null
      ? { homeScore: game.homeScore, awayScore: game.awayScore, period: game.period, clock: game.clock }
      : null;
  return {
    status: "pending",
    homeScore: null,
    awayScore: null,
    source: null,
    live,
    // `shown` is the pair alone: the clock is the label's business, not the score's.
    shown: live ? { homeScore: live.homeScore, awayScore: live.awayScore } : null,
    label: live ? "In progress" : "Scheduled",
    note: null,
    feedFinal: null,
  };
}

/** "Oklahoma 24, Michigan 27", or "pending" / "void": the audit log reads without joins. */
export function describeResult(game: Game): string {
  const result = effectiveResult(game);
  if (result.status !== "final") return result.status;
  return `${game.awayTeam} ${result.awayScore}, ${game.homeTeam} ${result.homeScore}`;
}
