/**
 * The wire shape of a PickSheet: what the pick flow and review screen hold in
 * the browser, and what `GET /api/week/picks` returns. Dates travel as ISO
 * strings so the same object serializes from a server component and from a
 * route handler.
 */
import type { GameDetail } from "@/lib/scoring/types";
import type { PickSheet } from "./picks";

export interface GameJson {
  id: number;
  awayTeamId: number;
  awayTeam: string;
  awayRank: number | null;
  homeTeamId: number;
  homeTeam: string;
  homeRank: number | null;
  kickoff: string;
  spread: string | null;
  void: boolean;
  voidNote: string | null;
  /** Venue, TV, line, win probability, forecast, and each team's form. Null for games added before the snapshot existed. */
  detail: GameDetail | null;
}

export interface PickJson {
  gameId: number;
  teamId: number;
  updatedAt: string;
}

export interface SheetJson {
  weekId: number;
  weekNumber: number;
  year: number;
  deadline: string;
  /** The server clock when this sheet was built; countdowns start from it, never from the phone's clock. */
  serverNow: string;
  locked: boolean;
  tiebreakerGameId: number | null;
  games: GameJson[];
  picks: PickJson[];
  lockGameId: number | null;
  tiebreakerGuess: number | null;
}

export function toSheetJson(sheet: PickSheet): SheetJson {
  return {
    weekId: sheet.week.id,
    weekNumber: sheet.week.weekNumber,
    year: sheet.season.year,
    deadline: sheet.deadline.toISOString(),
    serverNow: sheet.serverNow.toISOString(),
    locked: sheet.locked,
    tiebreakerGameId: sheet.week.tiebreakerGameId,
    games: sheet.games.map((g) => ({
      id: g.id,
      awayTeamId: g.awayTeamId,
      awayTeam: g.awayTeam,
      awayRank: g.awayRank,
      homeTeamId: g.homeTeamId,
      homeTeam: g.homeTeam,
      homeRank: g.homeRank,
      kickoff: g.kickoff.toISOString(),
      spread: g.spread,
      void: g.void,
      voidNote: g.voidNote,
      detail: g.detail,
    })),
    picks: sheet.picks.map((p) => ({ gameId: p.gameId, teamId: p.teamId, updatedAt: p.updatedAt.toISOString() })),
    lockGameId: sheet.lockGameId,
    tiebreakerGuess: sheet.tiebreakerGuess,
  };
}

/** The display name of a team in a game, by CollegeFootballData team id. */
export function teamName(game: GameJson, teamId: number): string {
  return teamId === game.homeTeamId ? game.homeTeam : game.awayTeam;
}
