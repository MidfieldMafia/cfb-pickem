/**
 * The wire shape of a Game on a screen. Every screen that shows a Game takes
 * this — the week list, the Reveal, both console pages, and the pick sheet
 * through `SheetGameJson` — never the Drizzle row: an explicit field
 * selection with the kickoff serialized at the seam. A screen can only reach
 * for what it was handed, and moving one to the browser is an annotation
 * rather than a rewrite.
 *
 * `cfbdGameId` is deliberately absent. It is the feed's join key, so the join
 * lives here in `toSlateCandidates` instead of in a view.
 *
 * Type-only imports throughout: this module is reachable from `"use client"`
 * files, so nothing it pulls in may reach the Drizzle schema at runtime.
 */
import type { Game } from "@/db/schema";
import type { CandidateGame } from "@/lib/cfbd/candidates";

export interface GameJson {
  id: number;
  awayTeamId: number;
  awayTeam: string;
  awayRank: number | null;
  homeTeamId: number;
  homeTeam: string;
  homeRank: number | null;
  /** ISO 8601. `LocalTime` takes the string as it stands. */
  kickoff: string;
  spread: string | null;
  void: boolean;
  voidNote: string | null;
}

export function toGameJson(game: Game): GameJson {
  return {
    id: game.id,
    awayTeamId: game.awayTeamId,
    awayTeam: game.awayTeam,
    awayRank: game.awayRank,
    homeTeamId: game.homeTeamId,
    homeTeam: game.homeTeam,
    homeRank: game.homeRank,
    kickoff: game.kickoff.toISOString(),
    spread: game.spread,
    void: game.void,
    voidNote: game.voidNote,
  };
}

/** A feed candidate for the slate builder, already matched against the Slate. */
export interface SlateCandidate {
  candidate: CandidateGame;
  /** The Slate Game this candidate is already on, or null when it is not on the slate. */
  onSlate: GameJson | null;
}

/**
 * Marries the week's feed candidates to the Slate. The match is on the feed's
 * game id, which is the whole reason this is a function rather than something
 * the console does inline: the builder needs to know which candidates are
 * already on the slate without a view ever holding the join key.
 */
export function toSlateCandidates(candidates: CandidateGame[], slateGames: Game[]): SlateCandidate[] {
  const byFeedId = new Map(slateGames.map((game) => [game.cfbdGameId, game]));
  return candidates.map((candidate) => {
    const game = byFeedId.get(candidate.cfbdGameId);
    return { candidate, onSlate: game ? toGameJson(game) : null };
  });
}

/** The display name of a team in a game, by CollegeFootballData team id. */
export function teamName(game: GameJson, teamId: number): string {
  return teamId === game.homeTeamId ? game.homeTeam : game.awayTeam;
}
