/**
 * Builders for scoring-engine test data. One copy of each, so a change to
 * `Game`, `Week` or `Rules` is one edit and the suites cannot drift into
 * meaning slightly different things.
 */
import type { Game, Rules, Week } from "../types";

/** The 2026 season's Rules: 10 points a correct pick, a Lock worth double. */
export const rules2026: Rules = { pointsPerCorrectPick: 10, lockMultiplier: 2 };

export function finalGame(
  id: string,
  home: string,
  away: string,
  homeScore: number,
  awayScore: number,
): Game {
  return { id, homeTeam: home, awayTeam: away, homeScore, awayScore, status: "final", void: false };
}

export function week(overrides: Partial<Week>): Week {
  return {
    weekNumber: 1,
    deadline: "2026-09-05T16:00:00Z",
    published: true,
    tiebreakerGameId: null,
    games: [],
    picks: [],
    locks: [],
    tiebreakerGuesses: [],
    ...overrides,
  };
}
