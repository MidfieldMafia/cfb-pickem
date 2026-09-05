/**
 * SYNTHETIC fixture standing in for Week 1 of 2026 until that week is final.
 *
 * Matchups are plausible, scores are invented. Replace the games and picks
 * with the real published slate, real final scores, and the members' real
 * picks once Week 1 is final, then re-verify the expected standings by hand
 * in week-1-2026.test.ts.
 *
 * Designed to exercise every rule at once: a Lock that hits, a Lock that
 * misses, a Lock dropped by a Void, a Void game, unpicked games, a member
 * with no Tiebreaker Guess, a points tie broken by the Tiebreaker Guess,
 * and a member who joined days before the Deadline.
 */
import type { Game, Member, Rules, Week } from "../types";

export const rules2026: Rules = { pointsPerCorrectPick: 10, lockMultiplier: 2 };

export const members: Member[] = [
  { id: "jonah", joinedAt: "2026-08-01T00:00:00Z" },
  { id: "alex", joinedAt: "2026-08-01T00:00:00Z" },
  { id: "grandma", joinedAt: "2026-08-02T00:00:00Z" },
  { id: "uncle-rick", joinedAt: "2026-08-15T00:00:00Z" },
  { id: "cousin-em", joinedAt: "2026-09-04T18:30:00Z" },
];

function final(id: string, homeTeam: string, awayTeam: string, homeScore: number, awayScore: number): Game {
  return { id, homeTeam, awayTeam, homeScore, awayScore, status: "final", void: false };
}

// Winners: Georgia, Texas, Alabama, Oklahoma, Notre Dame, Tennessee, Oregon, Penn State, Ole Miss. Game 10 is Void.
const games: Game[] = [
  final("g1", "Georgia", "Clemson", 34, 21),
  final("g2", "Ohio State", "Texas", 17, 24),
  final("g3", "Alabama", "Florida State", 42, 10),
  final("g4", "LSU", "Oklahoma", 27, 31),
  final("g5", "Michigan", "Notre Dame", 20, 23),
  final("g6", "Tennessee", "Auburn", 38, 35), // Tiebreaker Game, combined 73
  final("g7", "Oregon", "Washington", 45, 14),
  final("g8", "Penn State", "USC", 28, 24),
  final("g9", "Ole Miss", "Kentucky", 31, 13),
  { id: "g10", homeTeam: "Iowa State", awayTeam: "Kansas State", homeScore: null, awayScore: null, status: "scheduled", void: true },
];

function picksFor(memberId: string, teams: Record<string, string>) {
  return Object.entries(teams).map(([gameId, team]) => ({ memberId, gameId, team }));
}

export const week1: Week = {
  weekNumber: 1,
  deadline: "2026-09-05T16:00:00Z",
  published: true,
  tiebreakerGameId: "g6",
  games,
  picks: [
    // 7 correct, 2 wrong (g2, g4). Lock on g3 hits.
    ...picksFor("jonah", {
      g1: "Georgia", g2: "Ohio State", g3: "Alabama", g4: "LSU", g5: "Notre Dame",
      g6: "Tennessee", g7: "Oregon", g8: "Penn State", g9: "Ole Miss", g10: "Iowa State",
    }),
    // 6 correct, 3 wrong (g5, g6, g8). Lock on the Void g10 is dropped.
    ...picksFor("alex", {
      g1: "Georgia", g2: "Texas", g3: "Alabama", g4: "Oklahoma", g5: "Michigan",
      g6: "Auburn", g7: "Oregon", g8: "USC", g9: "Ole Miss", g10: "Kansas State",
    }),
    // 7 correct, 2 wrong (g7, g9), g10 unpicked. Lock on g2 hits. Ties Jonah on points.
    ...picksFor("grandma", {
      g1: "Georgia", g2: "Texas", g3: "Alabama", g4: "Oklahoma", g5: "Notre Dame",
      g6: "Tennessee", g7: "Washington", g8: "Penn State", g9: "Kentucky",
    }),
    // 0 correct, 9 wrong. Lock on g1 misses. No Tiebreaker Guess.
    ...picksFor("uncle-rick", {
      g1: "Clemson", g2: "Ohio State", g3: "Florida State", g4: "LSU", g5: "Michigan",
      g6: "Auburn", g7: "Washington", g8: "USC", g9: "Kentucky", g10: "Iowa State",
    }),
    // Joined the day before the Deadline and only got through three games. 3 correct.
    ...picksFor("cousin-em", { g1: "Georgia", g2: "Texas", g3: "Alabama" }),
  ],
  locks: [
    { memberId: "jonah", gameId: "g3" },
    { memberId: "alex", gameId: "g10" },
    { memberId: "grandma", gameId: "g2" },
    { memberId: "uncle-rick", gameId: "g1" },
  ],
  tiebreakerGuesses: [
    { memberId: "jonah", guess: 70 },
    { memberId: "alex", guess: 60 },
    { memberId: "grandma", guess: 77 },
    { memberId: "cousin-em", guess: 73 },
  ],
};
