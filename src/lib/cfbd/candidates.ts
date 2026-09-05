import type { CfbdClient, CfbdGame, CfbdPollWeek, WeekQuery } from "./types";

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
}

const POLL_PREFERENCE = ["AP Top 25", "Coaches Poll"];

/**
 * Ranks for a week come from the most recent poll published on or before it,
 * because the week's own poll is not out until the previous Saturday's games
 * are played. Prefers the AP poll, then the Coaches poll.
 */
export function rankLookup(pollWeeks: CfbdPollWeek[], week: number): Map<number, number> {
  const eligible = pollWeeks.filter((w) => w.week <= week).sort((a, b) => b.week - a.week);
  for (const pollWeek of eligible) {
    for (const name of POLL_PREFERENCE) {
      const poll = pollWeek.polls.find((p) => p.poll === name);
      if (poll) {
        return new Map(poll.ranks.filter((r) => r.rank !== null).map((r) => [r.teamId, r.rank as number]));
      }
    }
  }
  return new Map();
}

export async function weekCandidates(cfbd: CfbdClient, query: WeekQuery): Promise<CandidateGame[]> {
  const [games, pollWeeks, betting] = await Promise.all([
    cfbd.games(query),
    cfbd.rankings(query.year),
    cfbd.lines(query),
  ]);
  const ranks = rankLookup(pollWeeks, query.week);
  const spreads = new Map<number, string>();
  for (const game of betting) {
    const line = game.lines.find((l) => l.spread !== null);
    if (line) spreads.set(game.id, line.formattedSpread ?? `${line.spread}`);
  }
  return games
    .map((game) => toCandidate(game, ranks, spreads))
    .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime() || a.cfbdGameId - b.cfbdGameId);
}

function toCandidate(game: CfbdGame, ranks: Map<number, number>, spreads: Map<number, string>): CandidateGame {
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
  };
}
