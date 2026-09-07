/**
 * The presentation snapshot a Game carries for the pick screen: venue, TV, the
 * line, the win bar, the forecast, and each team's form. Taken from the feed at
 * add time, stored on the Game's `detail` column, and read only by screens.
 *
 * It lives here, at the top of `src/lib` and free of every other module, because
 * its four consumers sit in four different places and none of them owns it:
 * `cfbd/details.ts` builds it from the feed, `db/schema.ts` types the column,
 * `picks/json.ts` puts it on the wire, and `components/picks/` renders it. Any
 * home inside one of those makes the other three depend on that one.
 *
 * It used to live in `scoring/types.ts`, below a comment saying the engine never
 * reads any of it — which was true, and left the scoring engine's type module as
 * the thing the database schema and a `"use client"` component both imported to
 * get a Lucide icon name. Db-free like `notes.ts` and `results/result.ts`, so a
 * client bundle can name these shapes without reaching the Drizzle schema.
 */

/** The Lucide icons the forecast can ask for. */
export type SkyIcon = "sun" | "moon" | "cloud" | "cloud-sun" | "cloud-rain" | "cloud-sun-rain";

export interface Weather {
  /** Degrees Fahrenheit. From /games/weather. */
  temperature: number;
  /**
   * Percent chance of precipitation at kickoff, from Open-Meteo (the
   * CollegeFootballData feed carries amounts, never a chance). The pill hides
   * it below 20. Null when the kickoff is past the forecast horizon.
   */
  precipitation: number | null;
  icon: SkyIcon;
  /** Miles per hour. From /games/weather. */
  wind: number;
}

/** One team's form going into a game. */
export interface TeamDetail {
  /** AP rank, null when unranked. From /rankings. */
  rank: number | null;
  /** Display form, e.g. "2–0" with an en dash. From /records. */
  record: string;
  /**
   * Per-game averages: points from the season's completed /games, yards from
   * /stats/season. Null before a team's first game and for FCS opponents,
   * whom the FBS stats feed does not cover; the bar renders a dash.
   */
  pointsFor: number | null;
  pointsAgainst: number | null;
  yardsFor: number | null;
  yardsAgainst: number | null;
}

/**
 * Carries no id of its own. It reaches a screen already attached to the Game it
 * describes — as that Game's `detail` column, or as `SheetGameJson.detail` — so
 * there is no join for an id to serve. It held a `gameId` until this module was
 * split out: a `String(game.id)` written once from the CollegeFootballData feed,
 * read by nothing, and typed as the engine's `GameId`, which is a database id
 * everywhere else it appears.
 */
export interface GameDetail {
  /** ISO 8601 UTC kickoff. */
  kickoff: string;
  venue: string;
  city: string;
  /** Broadcaster, null when unannounced. From /games/media. */
  tv: string | null;
  /** Pregame win probability for the home team, 0–1. From /metrics/wp/pregame. */
  homeWp: number | null;
  /** From the favorite's perspective, e.g. "Georgia −6.5". "Pick" when even. */
  spread: string;
  /** Null until the paid-tier /games/weather feed is wired. */
  weather: Weather | null;
  home: TeamDetail;
  away: TeamDetail;
}
