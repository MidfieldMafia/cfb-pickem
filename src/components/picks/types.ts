import type { GameDetail } from "@/lib/detail";

/**
 * What the matchup panel reads out of a Game's snapshotted detail: the win bar
 * and each team's form. A slice of `GameDetail` rather than its own shape, so a
 * caller holding one passes it straight through. Null when the slate predates
 * the detail snapshot, and the panel renders the spread alone.
 */
export type MatchupDetail = Pick<GameDetail, "homeWp" | "home" | "away">;
