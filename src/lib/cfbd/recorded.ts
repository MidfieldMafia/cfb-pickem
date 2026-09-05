import games2026w2 from "./fixtures/2026-week-2/games.json";
import lines2026w2 from "./fixtures/2026-week-2/lines.json";
import rankings2026 from "./fixtures/2026-week-2/rankings.json";
import type { CfbdBettingGame, CfbdClient, CfbdGame, CfbdPollWeek } from "./types";

export interface Recording {
  games: CfbdGame[];
  rankings: CfbdPollWeek[];
  lines: CfbdBettingGame[];
}

/**
 * Responses recorded from the live API with the project key. Rankings hold
 * the season's poll weeks so far; other-division polls were dropped.
 */
export const recordings = {
  "2026-week-2": {
    games: games2026w2 as CfbdGame[],
    rankings: rankings2026 as CfbdPollWeek[],
    lines: lines2026w2 as CfbdBettingGame[],
  },
} satisfies Record<string, Recording>;

export type RecordingName = keyof typeof recordings;

/**
 * A client that replays a recording. `overrides` lets a test change what the
 * feed says next (a moved kickoff, say) without touching the fixture files.
 */
export function recordedCfbd(name: RecordingName, overrides: Partial<Recording> = {}): CfbdClient {
  const recording = { ...recordings[name], ...overrides };
  return {
    games: async () => recording.games,
    rankings: async () => recording.rankings,
    lines: async () => recording.lines,
  };
}
