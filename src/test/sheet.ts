/**
 * A `SheetJson` by hand, for the screens that take one. The server-seam suites
 * build their week from the recorded feed through a real database; a component
 * test cannot, because it runs in jsdom and the wire shape is all the screen
 * ever sees anyway.
 *
 * Deliberately the same Week 2 the fixture publishes — Friday's Miami kickoff
 * as the Deadline — so a number in a component test means what it means
 * everywhere else in the suite.
 */
import type { GameResult } from "@/lib/results/result";
import type { SheetGameJson, SheetJson } from "@/lib/picks/json";
import { sheetProgress } from "@/lib/picks/progress";

/** Friday's Miami kickoff: the Deadline in the Week 2 fixture. */
export const DEADLINE = "2026-09-11T00:00:00.000Z";
/** Two hours before it, on the server's clock. */
export const SERVER_NOW = "2026-09-10T22:00:00.000Z";

/** A game with no result yet, which is every game while picks are open. */
const SCHEDULED: GameResult = {
  status: "pending",
  homeScore: null,
  awayScore: null,
  source: null,
  live: null,
  shown: null,
  label: "Scheduled",
  note: null,
  feedFinal: null,
};

export const VOIDED: GameResult = {
  ...SCHEDULED,
  status: "void",
  label: "Void",
  note: "Cancelled for weather.",
};

interface GameSpec {
  id: number;
  away: string;
  home: string;
  kickoff?: string;
  result?: GameResult;
}

export function sheetGame({ id, away, home, kickoff, result }: GameSpec): SheetGameJson {
  return {
    game: {
      id,
      awayTeamId: id * 10 + 1,
      awayTeam: away,
      awayRank: null,
      homeTeamId: id * 10 + 2,
      homeTeam: home,
      homeRank: null,
      kickoff: kickoff ?? "2026-09-12T16:00:00.000Z",
      spread: null,
    },
    result: result ?? SCHEDULED,
    detail: null,
  };
}

/** The three Week 2 games the fixture publishes, as the wire carries them. */
export const MIAMI = sheetGame({ id: 1, away: "Florida A&M", home: "Miami", kickoff: DEADLINE });
export const MICHIGAN = sheetGame({ id: 2, away: "Oklahoma", home: "Michigan" });
export const TEXAS = sheetGame({ id: 3, away: "Ohio State", home: "Texas", kickoff: "2026-09-12T23:30:00.000Z" });

/**
 * A sheet with nothing filled in, overridable field by field. `progress` is
 * computed rather than passed, because a screen recounts it and a hand-written
 * one that disagreed would be testing the fixture rather than the screen.
 */
export function sheet(over: Partial<SheetJson> = {}): SheetJson {
  const base = {
    weekId: 1,
    weekNumber: 2,
    year: 2026,
    deadline: DEADLINE,
    serverNow: SERVER_NOW,
    locked: false,
    tiebreakerGameId: TEXAS.game.id,
    games: [MIAMI, MICHIGAN, TEXAS] as SheetGameJson[],
    picks: [],
    lockGameId: null,
    lockDropped: false,
    tiebreakerGuess: null,
    ...over,
  };
  const picked = new Set(base.picks.map((p) => p.gameId));
  return { ...base, progress: sheetProgress({ ...base, picked: (gameId) => picked.has(gameId) }) };
}
