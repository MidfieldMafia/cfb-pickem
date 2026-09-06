import type { GameDetail } from "@/lib/scoring/types";
import { noRainChance, type RainChanceSource } from "@/lib/weather/open-meteo";
import { bookLines, weekDetails } from "./details";
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
 * Every game in the week with the detail the slate stores. The rain source
 * defaults to "unknown" so callers without a forecast wired still work.
 */
export async function weekCandidates(
  cfbd: CfbdClient,
  query: WeekQuery,
  rain: RainChanceSource = noRainChance,
): Promise<CandidateGame[]> {
  const [games, betting, details] = await Promise.all([
    cfbd.games(query),
    cfbd.lines(query),
    weekDetails(cfbd, rain, query),
  ]);
  const spreads = bookLines(betting);
  return games
    .map((game) => toCandidate(game, spreads, details.get(game.id)!))
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
