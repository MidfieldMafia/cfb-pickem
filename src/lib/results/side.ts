/**
 * Where one side of a Game stands, in the words the Live Board colours by:
 * won or lost once the game is final, leading or trailing while it is going,
 * level either way, and nothing at all before kickoff or for a Void. Read
 * off `GameResult`, so a Result Override or a Void decides this the way it
 * decides everything else — the board never compares the feed's numbers
 * itself.
 *
 * Kept free of database imports, like `result.ts`: the Live Board is a
 * `"use client"` file and calls this on every poll.
 */
import type { GameResult, Score } from "./result";
import type { RevealPick } from "./results";

export type Side = "home" | "away";

export type SideStanding = "won" | "lost" | "leading" | "trailing" | "level" | "none";

function compare(score: Score, side: Side, settled: boolean): SideStanding {
  const mine = side === "home" ? score.homeScore : score.awayScore;
  const theirs = side === "home" ? score.awayScore : score.homeScore;
  if (mine === theirs) return "level";
  if (settled) return mine > theirs ? "won" : "lost";
  return mine > theirs ? "leading" : "trailing";
}

export function sideStanding(result: GameResult, side: Side): SideStanding {
  if (result.status === "final" && result.homeScore !== null && result.awayScore !== null) {
    return compare({ homeScore: result.homeScore, awayScore: result.awayScore }, side, true);
  }
  if (result.live) return compare(result.live, side, false);
  return "none";
}

/**
 * How many pennants a side's row holds before it starts counting instead.
 *
 * Five 28px pennants overlapping at 6px is 116px, and a 390px screen leaves
 * about 218px on that row once the team logo, the outcome mark and a
 * three-digit score have taken theirs — the rest is the team name, which
 * truncates but must stay readable. A sixth pennant is where the score starts
 * being pushed off the line.
 */
const SLOTS = 5;

/** A side's pennant row, capped so it stays on one line. */
export interface PennantRow {
  /** The picks that get a pennant, in board order. */
  shown: RevealPick[];
  /** How many more took this side than the row had room for; 0 when they all fit. */
  hidden: number;
}

/**
 * The picks a side's pennant row shows, and how many it cannot.
 *
 * A slate of ten games and twelve members puts up to twelve pennants on one
 * side of one row, which the row cannot hold — so past the cap it spends its
 * last slot on a "+N" rather than on a pennant, and the score stays where the
 * eye expects it. Under the cap nothing is counted and every member shows.
 *
 * The viewer is always among the shown, taking that last pennant slot when the
 * cap would otherwise have hidden them. The ring-offset marking "you" is the
 * first thing a member looks for on this row, and a board that folds them into
 * a "+8" because nine relatives picked the favourite has told them nothing
 * about their own week.
 */
export function pennantRow(picks: RevealPick[], viewerId: number, slots: number = SLOTS): PennantRow {
  if (picks.length <= slots) return { shown: picks, hidden: 0 };
  const shown = picks.slice(0, slots - 1);
  const viewer = picks.find((pick) => pick.memberId === viewerId);
  // Last slot rather than first: later pennants sit on top of the overlap.
  if (viewer && !shown.includes(viewer)) shown[shown.length - 1] = viewer;
  return { shown, hidden: picks.length - shown.length };
}
