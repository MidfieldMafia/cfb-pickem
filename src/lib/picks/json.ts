/**
 * The wire shape of a PickSheet: what the pick flow and review screen hold in
 * the browser, and what `GET /api/week/picks` returns. Dates travel as ISO
 * strings so the same object serializes from a server component and from a
 * route handler.
 */
import type { GameDetail } from "@/lib/scoring/types";
import { toGameView, type GameView } from "@/lib/slate/json";
import type { PickSheet } from "./picks";
import type { SheetProgress } from "./progress";

/** The Game-and-result pair every screen shares, plus the detail only the pick screen shows. */
export interface SheetGameJson extends GameView {
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
  games: SheetGameJson[];
  picks: PickJson[];
  lockGameId: number | null;
  /** True when the Lock sits on a Void game: a Dropped Lock. Scores nothing; movable until the Deadline. */
  lockDropped: boolean;
  tiebreakerGuess: number | null;
  /**
   * What was left before the Deadline when the server built this sheet. A
   * screen that has changed something the server has not answered yet recounts
   * with `sheetProgress` rather than reading a count that is one save behind.
   */
  progress: SheetProgress;
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
    games: sheet.games.map((g) => ({ ...toGameView(g), detail: g.detail })),
    picks: sheet.picks.map((p) => ({ gameId: p.gameId, teamId: p.teamId, updatedAt: p.updatedAt.toISOString() })),
    lockGameId: sheet.lockGameId,
    lockDropped: sheet.lockDropped,
    tiebreakerGuess: sheet.tiebreakerGuess,
    progress: sheet.progress,
  };
}
