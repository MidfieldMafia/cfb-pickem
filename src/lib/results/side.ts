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
