import type { GameDetail } from "@/lib/scoring/types";
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
  awayTeamId: number;
  awayTeam: string;
  awayRank: number | null;
  awayConference: string | null;
  kickoff: Date;
  kickoffTbd: boolean;
  /** "Texas -1.5"; information only. Null when no sportsbook has posted a line. */
  spread: string | null;
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
  const { details, games, lines } = await weekDetails(cfbd, rain, query);
  return games
    .map((game) => toCandidate(game, lines, details.get(game.id)!))
    .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime() || a.cfbdGameId - b.cfbdGameId);
}

function toCandidate(game: CfbdGame, spreads: Map<number, string>, detail: GameDetail): CandidateGame {
  return {
    cfbdGameId: game.id,
    homeTeamId: game.homeId,
    homeTeam: game.homeTeam,
    homeRank: detail.home.rank,
    homeConference: game.homeConference,
    awayTeamId: game.awayId,
    awayTeam: game.awayTeam,
    awayRank: detail.away.rank,
    awayConference: game.awayConference,
    kickoff: new Date(game.startDate),
    kickoffTbd: game.startTimeTBD,
    spread: spreads.get(game.id) ?? null,
    detail,
  };
}
