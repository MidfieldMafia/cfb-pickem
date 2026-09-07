/**
 * The wire shape of the Week as the Live Board holds it: what `/live` renders
 * on arrival and what `GET /api/week/state` answers every poll after. One
 * payload for the whole Week — the Slate with its live scores, everyone's
 * picks once the Deadline has passed, the provisional standings from the same
 * scoring pass, and the server clock — so the phone holds one object and
 * never stitches two reads that could disagree.
 *
 * Dates travel as ISO strings, as `SheetJson`'s do, so the same object
 * serializes from a server component and from a route handler. Nothing here
 * may reach the database at runtime: the Live Board is a `"use client"` file
 * and imports this module.
 */
import type { RevealGame, ScoredMember, WeeklyScore, WeeklyWin } from "@/lib/results/results";
import type { SeasonStanding } from "@/lib/results/summary";
import { toGameView, toWeekJson, type WeekJson } from "@/lib/slate/json";
import type { WeekContext } from "./week";

export interface WeekStateJson {
  week: WeekJson;
  year: number;
  /** ISO 8601. */
  deadline: string;
  /** The server clock when this state was built. Left out of the ETag, or nothing would ever be unchanged. */
  serverNow: string;
  /** True once the server clock has reached the Deadline: the Reveal is on. */
  locked: boolean;
  /** Every non-void game is final, so there is nothing left to poll for. False before the Deadline whatever the games say. */
  complete: boolean;
  /** The board — who this Week counts. Empty before the Deadline. */
  members: ScoredMember[];
  /** The Slate in kickoff order, each Game with its result and, after the Deadline, who took each side. */
  games: RevealGame[];
  /**
   * Everyone's Weekly Score as the engine grades the rows right now, in
   * finish order: provisional while games are going, because a pending pick
   * scores nothing until its game is final. Null before the Deadline.
   */
  scores: WeeklyScore[] | null;
  weeklyWin: WeeklyWin | null;
  /**
   * The viewer's own place and total across the season, this Week's
   * provisional points included: the card at the top of the Live Board, as
   * mockup 05 draws it. Null before the Deadline, and for a member who has
   * played no Week yet.
   *
   * The viewer's standing rather than the whole Leaderboard, because that card
   * is the only thing on this screen that reads the season, and shipping every
   * member's season row down a thirty-second poll to render one line would be
   * paying for the Leaderboard on the Live Board's budget.
   */
  season: SeasonStanding | null;
}

/**
 * The Week a member is standing in, as the phone reads it. Before the
 * Deadline the Games carry no picks and the standings are null — the Reveal
 * is what the Deadline gates, and `currentWeek` never grades before it — so
 * the two shapes of the screen are one shape with two empty halves.
 */
export function toWeekStateJson({ slate, sheet, result, season }: WeekContext): WeekStateJson {
  return {
    week: toWeekJson(slate.week),
    year: slate.season.year,
    deadline: sheet.deadline.toISOString(),
    serverNow: sheet.serverNow.toISOString(),
    locked: sheet.locked,
    complete: result?.complete ?? false,
    members: result?.reveal.members ?? [],
    games: result ? result.reveal.games : slate.games.map((game) => ({ ...toGameView(game), picks: [] })),
    scores: result?.scores ?? null,
    weeklyWin: result?.weeklyWin ?? null,
    season,
  };
}
