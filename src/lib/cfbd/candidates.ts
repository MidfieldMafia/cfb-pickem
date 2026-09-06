import type { GameDetail } from "@/lib/scoring/types";
import { noRainChance, type RainChanceSource } from "@/lib/weather/open-meteo";
import { weekDetails } from "./details";
import { rankLookup } from "./rankings";
import type { CfbdClient, CfbdGame, WeekQuery } from "./types";

export { rankLookup };

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
  const [games, pollWeeks, betting, details] = await Promise.all([
    cfbd.games(query),
    cfbd.rankings(query.year),
    cfbd.lines(query),
    weekDetails(cfbd, rain, query),
  ]);
  const ranks = rankLookup(pollWeeks, query.week);
  const spreads = new Map<number, string>();
  for (const game of betting) {
    const line = game.lines.find((l) => l.spread !== null);
    if (line) spreads.set(game.id, line.formattedSpread ?? `${line.spread}`);
  }
  return games
    .map((game) => toCandidate(game, ranks, spreads, details.get(game.id)!))
    .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime() || a.cfbdGameId - b.cfbdGameId);
}

function toCandidate(
  game: CfbdGame,
  ranks: Map<number, number>,
  spreads: Map<number, string>,
  detail: GameDetail,
): CandidateGame {
  return {
    cfbdGameId: game.id,
    homeTeamId: game.homeId,
    homeTeam: game.homeTeam,
    homeRank: ranks.get(game.homeId) ?? null,
    homeConference: game.homeConference,
    awayTeamId: game.awayId,
    awayTeam: game.awayTeam,
    awayRank: ranks.get(game.awayId) ?? null,
    awayConference: game.awayConference,
    kickoff: new Date(game.startDate),
    kickoffTbd: game.startTimeTBD,
    spread: spreads.get(game.id) ?? null,
    detail,
  };
}
