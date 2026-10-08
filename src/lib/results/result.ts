/**
 * What happened to a Game: the Void first, then the Result Override, then the
 * feed. One derivation, read by scoring, by the Reveal, and by both console
 * tables.
 *
 * Kept free of database imports, like `picks/progress.ts` and
 * `members/limits.ts`, so `slate/json.ts` can build a `GameView` without
 * dragging the Drizzle schema into a browser bundle. Writing a result, and
 * the audit row each commissioner change logs, is next door in `writes.ts`.
 */
import type { Game, PossessionSide } from "@/db/schema";
import { newerScore, type LiveFeed } from "./live-feed";

/**
 * Where a Game stands, worked out once so no caller rebuilds it from the score
 * and the clock. `due` is past kickoff with no word from the feed yet — feed
 * lag, a weather hold, or a postponement nobody has voided — and a screen
 * shows it as it shows `scheduled`, by its kickoff time.
 */
export type GamePhase = "scheduled" | "due" | "in_progress" | "final" | "void";

/** Where a final score came from. Null until final, and for a Void. */
export type ResultSource = "feed" | "override";

/** A home and away score pair. */
export interface Score {
  homeScore: number;
  awayScore: number;
}

/**
 * The running score, and where in the game it stands. The score is the live
 * play-by-play's newest play's whenever that is newer than the scoreboard's
 * (`newerScore`); everything else here but `feed` is the scoreboard's.
 */
export interface LiveScore extends Score {
  /** The quarter, 5 and up for overtime. Null when the feed has not said. */
  period: number | null;
  /** "08:42", as the feed writes it. Null when the feed has not said. */
  clock: string | null;
  /**
   * Which team has the ball, already resolved to a side. Null when the feed
   * has not said, and null too when it said something the resolver could not
   * place — so a screen must treat nothing-to-show as the ordinary case, not
   * an error.
   */
  possession: PossessionSide | null;
  /** The last play in the feed's own words, a full sentence. Null when the feed has not said. */
  lastPlay: string | null;
  /** The down-and-distance, "3rd & 7". Null when the feed has not said. */
  situation: string | null;
  /**
   * The live play-by-play's newest play and the next snap's down, distance
   * and spot. Null when the feed carries no play for the game, and a screen
   * then falls back to `lastPlay`, `situation` and `possession` above.
   */
  feed: LiveFeed | null;
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

/**
 * Which team has the ball, for the football on the Live Board row and the
 * Game sheet header (#208, as amended by #311): the live feed's resting side
 * whenever the feed carries the game — null at a break included, so a stale
 * scoreboard `possession` never shows a football at halftime — and the
 * scoreboard's `possession` only when it does not. The scoreboard names the
 * kicking team after a kick; the feed does not.
 */
export function sideWithBall(live: Pick<LiveScore, "possession" | "feed">): PossessionSide | null {
  return live.feed ? live.feed.ball : live.possession;
}

/** Every word a screen puts on a Game's state. One vocabulary, so the Reveal and the console agree. */
export type ResultLabel = "Scheduled" | "In progress" | "Final" | "Final · override" | "Void";

/**
 * A Game's result as scoring and screens see it. The whole answer, so no
 * screen re-derives part of it — `phase`, `homeScore` and `awayScore` are
 * what counts, `live` is the running score that does not, `shown` is the pair
 * to put on screen whichever of those it came from, and `label` is what to
 * call it.
 */
export interface GameResult {
  phase: GamePhase;
  homeScore: number | null;
  awayScore: number | null;
  source: ResultSource | null;
  /**
   * The feed's running score and clock. Set only while `in_progress`, and
   * null in every other phase.
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

/**
 * A game still under way this long after kickoff is postponed, canceled, or
 * stuck in the feed: a commissioner should look (`needsReview`), and the
 * server stops refreshing for it at the live rate (`refreshInterval`).
 */
export const REVIEW_AFTER_MS = 6 * 3600_000;

/** True while a Game is past kickoff and not yet final: `due` or `in_progress`. */
export function underway(result: Pick<GameResult, "phase">): boolean {
  return result.phase === "due" || result.phase === "in_progress";
}

/** Final or Void: nothing the feed says can change what counts. A Week whose every Game is settled is complete. */
export function settled(result: Pick<GameResult, "phase">): boolean {
  return result.phase === "final" || result.phase === "void";
}

/**
 * The result, decided in this order: the Void, then the Result Override, then
 * the feed's final, then the feed's running score, then the clock. `now` is
 * the server's: it decides `due`, and nothing else here reads it.
 */
export function effectiveResult(game: Game, now: Date): GameResult {
  if (game.void) {
    return {
      phase: "void",
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
      phase: "final",
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
      phase: "final",
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
      ? {
          ...newerScore(
            { homeScore: game.homeScore, awayScore: game.awayScore, period: game.period, clock: game.clock },
            game.liveFeed,
          ),
          period: game.period,
          clock: game.clock,
          possession: game.possession,
          lastPlay: game.lastPlay,
          situation: game.situation,
          feed: game.liveFeed,
        }
      : null;
  return {
    phase: live ? "in_progress" : game.kickoff <= now ? "due" : "scheduled",
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

/**
 * "Oklahoma 24, Michigan 27", or "pending" / "void": the audit log reads
 * without joins. Every phase short of final is "pending", as it always was,
 * so old and new audit rows read alike — and the clock never decides a row.
 */
export function describeResult(game: Game): string {
  // Any instant will do: the clock only tells `due` from `scheduled`, and both are "pending" here.
  const result = effectiveResult(game, game.kickoff);
  if (result.phase === "void") return "void";
  if (result.phase !== "final") return "pending";
  return `${game.awayTeam} ${result.awayScore}, ${game.homeTeam} ${result.homeScore}`;
}
