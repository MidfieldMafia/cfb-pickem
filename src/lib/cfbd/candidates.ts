import type { GameDetail } from "@/lib/detail";
import type { RainChanceSource } from "@/lib/weather/open-meteo";
import { weekDetails } from "./details";
import type { CfbdClient, CfbdGame, WeekQuery } from "./types";

/** A game a commissioner can put on a Slate: the feed's game plus rank and spread. */
export interface CandidateGame {
  cfbdGameId: number;
  homeTeamId: number;
  homeTeam: string;
  homeRank: number | null;
  homeConference: string | null;
  homeClassification: string | null;
  awayTeamId: number;
  awayTeam: string;
  awayRank: number | null;
  awayConference: string | null;
  awayClassification: string | null;
  kickoff: Date;
  kickoffTbd: boolean;
  /** "Texas -1.5"; information only. Null when no sportsbook has posted a line. */
  spread: string | null;
  /**
   * Home-team-perspective numeric spread, for sorting: the sportsbook's if
   * one has posted, else the win-probability model's. Null when neither
   * exists, so a sort can place these games rather than guess at them.
   */
  spreadValue: number | null;
  /** Pick-screen detail: venue, TV, line, win probability, forecast, each team's form. */
  detail: GameDetail;
}

/**
 * Every game in the week with the detail the slate stores, off one fan-out.
 * The rain source is required: it used to default to "unknown", which meant a
 * caller that simply forgot the argument would overwrite real forecasts with
 * nulls on the next refresh. `noRainChance` is still there for callers that
 * mean it.
 */
export async function weekCandidates(
  cfbd: CfbdClient,
  query: WeekQuery,
  rain: RainChanceSource,
): Promise<CandidateGame[]> {
  const { details, games, lines, spreads } = await weekDetails(cfbd, rain, query);
  return games
    .map((game) => toCandidate(game, lines, spreads, details.get(game.id)!))
    .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime() || a.cfbdGameId - b.cfbdGameId);
}

function toCandidate(
  game: CfbdGame,
  spreadText: Map<number, string>,
  spreadValues: Map<number, number>,
  detail: GameDetail,
): CandidateGame {
  return {
    cfbdGameId: game.id,
    homeTeamId: game.homeId,
    homeTeam: game.homeTeam,
    homeRank: detail.home.rank,
    homeConference: game.homeConference,
    homeClassification: game.homeClassification,
    awayTeamId: game.awayId,
    awayTeam: game.awayTeam,
    awayRank: detail.away.rank,
    awayConference: game.awayConference,
    awayClassification: game.awayClassification,
    kickoff: new Date(game.startDate),
    kickoffTbd: game.startTimeTBD,
    spread: spreadText.get(game.id) ?? null,
    spreadValue: spreadValues.get(game.id) ?? null,
    detail,
  };
}
