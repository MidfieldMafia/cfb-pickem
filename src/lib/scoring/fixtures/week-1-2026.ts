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
import type { Game, GameDetail, GameId, Member, Rules, TeamDetail, TeamId, Week } from "../types";

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

/*
 * Presentation detail for the same ten games. Synthetic like the rest of this
 * fixture: form numbers and forecasts are invented, venues and networks are
 * plausible. Joined to a Game by id so the screens and the engine read one
 * slate and cannot drift.
 */

/** Kickoff windows, in UTC. Noon here is the week's Deadline: the earliest kickoff. */
const NOON = "2026-09-05T16:00:00Z";
const AFTERNOON = "2026-09-05T19:30:00Z";
const NIGHT = "2026-09-05T23:30:00Z";

const teamDetails: Record<string, TeamDetail> = {
  Georgia: { rank: 1, record: "2–0", pointsFor: 38.5, pointsAgainst: 14, yardsFor: 468, yardsAgainst: 281 },
  Clemson: { rank: 12, record: "1–1", pointsFor: 31, pointsAgainst: 20.5, yardsFor: 422, yardsAgainst: 336 },
  "Ohio State": { rank: 3, record: "2–0", pointsFor: 41.5, pointsAgainst: 9.5, yardsFor: 491, yardsAgainst: 244 },
  Texas: { rank: 4, record: "2–0", pointsFor: 36, pointsAgainst: 12.5, yardsFor: 455, yardsAgainst: 262 },
  Alabama: { rank: 5, record: "1–1", pointsFor: 33.5, pointsAgainst: 19, yardsFor: 447, yardsAgainst: 318 },
  "Florida State": { rank: null, record: "0–2", pointsFor: 17.5, pointsAgainst: 27, yardsFor: 331, yardsAgainst: 402 },
  LSU: { rank: 9, record: "2–0", pointsFor: 34, pointsAgainst: 18.5, yardsFor: 462, yardsAgainst: 330 },
  Oklahoma: { rank: 15, record: "2–0", pointsFor: 30.5, pointsAgainst: 13, yardsFor: 404, yardsAgainst: 289 },
  Michigan: { rank: 10, record: "1–1", pointsFor: 27, pointsAgainst: 17.5, yardsFor: 378, yardsAgainst: 301 },
  "Notre Dame": { rank: 7, record: "2–0", pointsFor: 35.5, pointsAgainst: 11, yardsFor: 438, yardsAgainst: 270 },
  Tennessee: { rank: 11, record: "2–0", pointsFor: 44, pointsAgainst: 15.5, yardsFor: 512, yardsAgainst: 296 },
  Auburn: { rank: null, record: "1–1", pointsFor: 28.5, pointsAgainst: 21, yardsFor: 401, yardsAgainst: 352 },
  Oregon: { rank: 2, record: "2–0", pointsFor: 40, pointsAgainst: 12, yardsFor: 486, yardsAgainst: 258 },
  Washington: { rank: 22, record: "2–0", pointsFor: 32.5, pointsAgainst: 17, yardsFor: 433, yardsAgainst: 322 },
  "Penn State": { rank: 6, record: "2–0", pointsFor: 37, pointsAgainst: 10.5, yardsFor: 458, yardsAgainst: 251 },
  USC: { rank: 19, record: "1–1", pointsFor: 34.5, pointsAgainst: 24.5, yardsFor: 470, yardsAgainst: 371 },
  "Ole Miss": { rank: 8, record: "2–0", pointsFor: 43, pointsAgainst: 13.5, yardsFor: 528, yardsAgainst: 277 },
  Kentucky: { rank: null, record: "1–1", pointsFor: 22, pointsAgainst: 20.5, yardsFor: 352, yardsAgainst: 340 },
  "Iowa State": { rank: 20, record: "2–0", pointsFor: 29.5, pointsAgainst: 16, yardsFor: 398, yardsAgainst: 309 },
  "Kansas State": { rank: 17, record: "1–1", pointsFor: 31.5, pointsAgainst: 22, yardsFor: 417, yardsAgainst: 358 },
};

const UNKNOWN_TEAM: TeamDetail = {
  rank: null,
  record: "0–0",
  pointsFor: 0,
  pointsAgainst: 0,
  yardsFor: 0,
  yardsAgainst: 0,
};

export function teamDetail(team: TeamId): TeamDetail {
  return teamDetails[team] ?? UNKNOWN_TEAM;
}

export const gameDetails: GameDetail[] = [
  {
    gameId: "g1",
    kickoff: NOON,
    venue: "Sanford Stadium",
    city: "Athens, GA",
    tv: "ABC",
    homeWp: 0.68,
    spread: "Georgia −6.5",
    weather: { temperature: 78, precipitation: 10, icon: "sun", wind: 6 },
    home: teamDetail("Georgia"),
    away: teamDetail("Clemson"),
  },
  {
    gameId: "g2",
    kickoff: NOON,
    venue: "Ohio Stadium",
    city: "Columbus, OH",
    tv: "FOX",
    homeWp: 0.55,
    spread: "Ohio State −2.5",
    weather: { temperature: 71, precipitation: 20, icon: "cloud-sun", wind: 9 },
    home: teamDetail("Ohio State"),
    away: teamDetail("Texas"),
  },
  {
    gameId: "g3",
    kickoff: AFTERNOON,
    venue: "Bryant-Denny Stadium",
    city: "Tuscaloosa, AL",
    tv: "CBS",
    homeWp: 0.81,
    spread: "Alabama −13.5",
    weather: { temperature: 88, precipitation: 35, icon: "cloud-sun-rain", wind: 5 },
    home: teamDetail("Alabama"),
    away: teamDetail("Florida State"),
  },
  {
    gameId: "g4",
    kickoff: AFTERNOON,
    venue: "Tiger Stadium",
    city: "Baton Rouge, LA",
    tv: "ESPN",
    homeWp: 0.61,
    spread: "LSU −4",
    weather: { temperature: 91, precipitation: 55, icon: "cloud-rain", wind: 8 },
    home: teamDetail("LSU"),
    away: teamDetail("Oklahoma"),
  },
  {
    gameId: "g5",
    kickoff: NIGHT,
    venue: "Michigan Stadium",
    city: "Ann Arbor, MI",
    tv: "NBC",
    homeWp: 0.52,
    spread: "Michigan −1",
    weather: { temperature: 64, precipitation: 5, icon: "sun", wind: 12 },
    home: teamDetail("Michigan"),
    away: teamDetail("Notre Dame"),
  },
  {
    gameId: "g6",
    kickoff: NIGHT,
    venue: "Neyland Stadium",
    city: "Knoxville, TN",
    tv: "ESPN",
    homeWp: 0.7,
    spread: "Tennessee −7",
    weather: { temperature: 74, precipitation: 15, icon: "cloud-sun", wind: 4 },
    home: teamDetail("Tennessee"),
    away: teamDetail("Auburn"),
  },
  {
    gameId: "g7",
    kickoff: NIGHT,
    venue: "Autzen Stadium",
    city: "Eugene, OR",
    tv: "FOX",
    homeWp: 0.74,
    spread: "Oregon −9.5",
    weather: { temperature: 62, precipitation: 40, icon: "cloud-rain", wind: 10 },
    home: teamDetail("Oregon"),
    away: teamDetail("Washington"),
  },
  {
    gameId: "g8",
    kickoff: NIGHT,
    venue: "Beaver Stadium",
    city: "University Park, PA",
    tv: "ABC",
    homeWp: 0.58,
    spread: "Penn State −3",
    weather: { temperature: 59, precipitation: 10, icon: "moon", wind: 7 },
    home: teamDetail("Penn State"),
    away: teamDetail("USC"),
  },
  {
    gameId: "g9",
    kickoff: NIGHT,
    venue: "Vaught-Hemingway Stadium",
    city: "Oxford, MS",
    tv: "SECN",
    homeWp: 0.76,
    spread: "Ole Miss −10",
    weather: { temperature: 83, precipitation: 0, icon: "moon", wind: 3 },
    home: teamDetail("Ole Miss"),
    away: teamDetail("Kentucky"),
  },
  {
    gameId: "g10",
    kickoff: NIGHT,
    venue: "Jack Trice Stadium",
    city: "Ames, IA",
    tv: "FS1",
    homeWp: 0.5,
    spread: "Pick",
    weather: { temperature: 70, precipitation: 0, icon: "cloud", wind: 14 },
    home: teamDetail("Iowa State"),
    away: teamDetail("Kansas State"),
  },
];

const detailsById = new Map(gameDetails.map((d) => [d.gameId, d]));

export function gameDetail(id: GameId): GameDetail | undefined {
  return detailsById.get(id);
}
