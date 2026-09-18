import { describe, expect, test } from "vitest";
import type { GameResult } from "./result";
import type {
  LeaderboardRow,
  Reveal,
  RevealGame,
  RevealPick,
  ScoredMember,
  WeeklyScore,
  WeeklyWin,
} from "./results";
import type { GameJson, GameView } from "@/lib/slate/json";
import {
  averageLabel,
  movement,
  ordinal,
  pickBreakdown,
  record,
  seasonStanding,
  standing,
  tiebreakerOutcome,
  tiebreakerSentence,
  weeklyWinSentence,
} from "./summary";

/*
 * Everything here is db-free by design, so these are the wire shapes a screen
 * holds, built by hand. Two teams per game, ids that read as themselves.
 */

const PENDING: GameResult = {
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

function final(away: number, home: number): GameResult {
  return {
    status: "final",
    awayScore: away,
    homeScore: home,
    source: "feed",
    live: null,
    shown: { awayScore: away, homeScore: home },
    label: "Final",
    note: null,
    feedFinal: null,
  };
}

const VOID: GameResult = {
  status: "void",
  homeScore: null,
  awayScore: null,
  source: null,
  live: null,
  shown: null,
  label: "Void",
  note: "Postponed to December",
  feedFinal: null,
};

function gameJson(id: number, away: string, home: string): GameJson {
  return {
    id,
    awayTeamId: id * 10,
    awayTeam: away,
    awayRank: null,
    homeTeamId: id * 10 + 1,
    homeTeam: home,
    homeRank: null,
    kickoff: "2026-09-12T23:30:00.000Z",
    spread: null,
  };
}

function view(id: number, away: string, home: string, result: GameResult = PENDING): GameView {
  return { game: gameJson(id, away, home), result };
}

function member(id: number, displayName: string): ScoredMember {
  return { id, displayName, avatarId: null };
}

const GRANDMA = member(1, "Grandma");
const JONAH = member(2, "Jonah");
const ALEX = member(3, "Alex");

/** One Leaderboard row, ranked as `scoreSeason` already ranked it. */
function row(who: ScoredMember, rank: number, totalPoints: number): LeaderboardRow {
  return {
    member: who,
    rank,
    previousRank: null,
    totalPoints,
    correct: totalPoints / 10,
    incorrect: 0,
    weeklyWins: 0,
    weeksPlayed: 1,
    averagePoints: totalPoints,
    cumulativeTiebreakerError: 0,
    averageTiebreakerMiss: null,
  };
}

function score(who: ScoredMember, points: number, over: Partial<WeeklyScore> = {}): WeeklyScore {
  return {
    member: who,
    // Played by default; `over` is how a test says a member sat the week out.
    played: true,
    points,
    correct: points / 10,
    incorrect: 0,
    pending: 0,
    lockGameId: null,
    lockDropped: false,
    tiebreakerGuess: null,
    tiebreakerError: null,
    ...over,
  };
}

function pick(who: ScoredMember, teamId: number, over: Partial<RevealPick> = {}): RevealPick {
  return { memberId: who.id, teamId, outcome: "correct", lock: null, points: 10, ...over };
}

function reveal(games: RevealGame[], tiebreakerGameId: number | null = null): Reveal {
  return {
    week: { id: 7, weekNumber: 2, published: true, tiebreakerGameId },
    year: 2026,
    members: [GRANDMA, JONAH],
    games,
  };
}

describe("a member's record and place", () => {
  test("a record is wins and losses with an en dash, and a place carries its ordinal", () => {
    expect(record(8, 1)).toBe("8–1");
    expect(record(0, 0)).toBe("0–0");
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "101st",
    ]);
  });

  test("counts everyone strictly ahead, so members who are level share a place", () => {
    // Grandma and Jonah are level on points and on tiebreaker error; Alex trails.
    const scores = [
      score(GRANDMA, 30, { tiebreakerError: 4 }),
      score(JONAH, 30, { tiebreakerError: 4 }),
      score(ALEX, 10, { tiebreakerError: 9 }),
    ];

    expect(standing(scores, GRANDMA.id)).toEqual({ place: 1, of: 3, label: "1st of 3" });
    expect(standing(scores, JONAH.id)).toEqual({ place: 1, of: 3, label: "1st of 3" });
    // Two members are ahead of Alex, so third — the place is not the row index.
    expect(standing(scores, ALEX.id)).toEqual({ place: 3, of: 3, label: "3rd of 3" });
  });

  test("breaks a level score by tiebreaker closeness, and has no place for a member who was never on the board", () => {
    const scores = [score(GRANDMA, 30, { tiebreakerError: 2 }), score(JONAH, 30, { tiebreakerError: 9 })];

    expect(standing(scores, GRANDMA.id)!.place).toBe(1);
    expect(standing(scores, JONAH.id)!.place).toBe(2);
    // A member who joined after the Deadline is not in the scores at all. This
    // is the only way to have no place: a member who was here and picked
    // nothing is on the board, and the next test gives them a place.
    expect(standing(scores, ALEX.id)).toBeNull();
  });

  test("places a member who picked nothing last, and still counts them in the of", () => {
    // Jonah picked and scored nothing; Alex never picked. Both rows read zero,
    // so only `played` separates them — and it has to, or they would share a
    // place while being listed one above the other.
    const scores = [
      score(GRANDMA, 30, { tiebreakerError: 2 }),
      score(JONAH, 0, { correct: 0, incorrect: 3 }),
      score(ALEX, 0, { correct: 0, played: false }),
    ];

    expect(standing(scores, GRANDMA.id)).toEqual({ place: 1, of: 3, label: "1st of 3" });
    expect(standing(scores, JONAH.id)).toEqual({ place: 2, of: 3, label: "2nd of 3" });
    // Counted in the "of", and last: the week is still one they turned up for
    // on the board, just not one they played.
    expect(standing(scores, ALEX.id)).toEqual({ place: 3, of: 3, label: "3rd of 3" });
  });

  test("a season place is the rank the engine gave, with the season total beside it", () => {
    // Two members tie on every season tiebreak, so `scoreSeason` gave them the
    // same rank and nobody holds 2nd. The helper must not re-rank around that.
    const board = [row(GRANDMA, 1, 120), row(JONAH, 1, 120), row(ALEX, 3, 90)];

    expect(seasonStanding(board, GRANDMA.id)).toEqual({ place: 1, of: 3, label: "1st of 3", points: 120 });
    expect(seasonStanding(board, JONAH.id)).toEqual({ place: 1, of: 3, label: "1st of 3", points: 120 });
    expect(seasonStanding(board, ALEX.id)).toEqual({ place: 3, of: 3, label: "3rd of 3", points: 90 });
  });

  test("has no season place for a member the board does not carry", () => {
    // Nothing to show a member who has played no Week yet, as with a weekly place.
    expect(seasonStanding([row(GRANDMA, 1, 30)], ALEX.id)).toBeNull();
    expect(seasonStanding([], GRANDMA.id)).toBeNull();
  });
});

describe("how the weekly win is said", () => {
  const win = (over: Partial<WeeklyWin> = {}): WeeklyWin => ({
    winners: [GRANDMA],
    points: 30,
    decidedBy: "points",
    ...over,
  });

  test("names the winner, and how the engine decided it", () => {
    expect(weeklyWinSentence(win(), true)).toBe("Grandma took the week with 30");
    expect(weeklyWinSentence(win({ decidedBy: "tiebreaker" }), true)).toBe(
      "Grandma took the week with 30, closest on the Tiebreaker Guess",
    );
    expect(weeklyWinSentence(win({ winners: [GRANDMA, JONAH], decidedBy: "shared" }), true)).toBe(
      "Grandma and Jonah shared the week at 30",
    );
    expect(weeklyWinSentence(win({ winners: [GRANDMA, JONAH, ALEX], decidedBy: "shared" }), true)).toBe(
      "Grandma, Jonah and Alex shared the week at 30",
    );
  });

  test("a week with games still to play has a leader, not a winner", () => {
    expect(weeklyWinSentence(win(), false)).toBe("Grandma leads with 30");
    expect(weeklyWinSentence(win({ winners: [GRANDMA, JONAH] }), false)).toBe("Grandma and Jonah lead with 30");
  });

  test("nobody played the week", () => {
    expect(weeklyWinSentence(null, true)).toBeNull();
  });
});

describe("what the tiebreaker game settled", () => {
  const texas = view(1, "Ohio State", "Texas", final(31, 28));

  test("names every member tied for the lead, each with their own guess and error, closest first", () => {
    // Grandma and Jonah are tied at the top on points; Alex trails and is not
    // part of the tie the Guess had to break, however close their own guess was.
    const board = reveal([{ ...texas, picks: [] }], texas.game.id);
    const scores = [
      score(GRANDMA, 30, { tiebreakerGuess: 55, tiebreakerError: 4 }),
      score(JONAH, 30, { tiebreakerGuess: 70, tiebreakerError: 11 }),
      score(ALEX, 20, { tiebreakerGuess: 59, tiebreakerError: 0 }),
    ];
    const weeklyWin: WeeklyWin = { winners: [GRANDMA], points: 30, decidedBy: "tiebreaker" };

    const outcome = tiebreakerOutcome(board, scores, weeklyWin)!;
    expect(outcome.combined).toBe(59);
    expect(outcome.contenders.map((c) => c.member.displayName)).toEqual(["Grandma", "Jonah"]);
    expect(outcome.winners.map((m) => m.displayName)).toEqual(["Grandma"]);
    expect(tiebreakerSentence(outcome)).toBe(
      "Tiebreaker Guess: Ohio State at Texas finished 59. Grandma guessed 55 (off by 4) and Jonah guessed 70 (off by 11) — Grandma closest.",
    );
  });

  test("a single leader by points needs no Guess to settle anything, so the sentence names nobody", () => {
    const board = reveal([{ ...texas, picks: [] }], texas.game.id);
    const scores = [
      score(GRANDMA, 30, { tiebreakerGuess: 55, tiebreakerError: 4 }),
      score(JONAH, 20, { tiebreakerGuess: 59, tiebreakerError: 0 }),
    ];
    const weeklyWin: WeeklyWin = { winners: [GRANDMA], points: 30, decidedBy: "points" };

    const outcome = tiebreakerOutcome(board, scores, weeklyWin)!;
    expect(outcome.contenders).toEqual([]);
    // Jonah's guess was the closer of the two, but nobody's placement turned
    // on it — naming a "closest" here is exactly what made this sentence
    // disagree with the Weekly Win line above it.
    expect(tiebreakerSentence(outcome)).toBe("Tiebreaker Guess: Ohio State at Texas finished 59.");
  });

  test("a tied member who never guessed reads as such, not as the closest", () => {
    const board = reveal([{ ...texas, picks: [] }], texas.game.id);
    // The engine counts a missing Guess as 0 for scoring, but that is not a
    // Guess of 0 to show here.
    const scores = [
      score(GRANDMA, 30, { tiebreakerGuess: null, tiebreakerError: 59 }),
      score(JONAH, 30, { tiebreakerGuess: 40, tiebreakerError: 19 }),
    ];
    const weeklyWin: WeeklyWin = { winners: [JONAH], points: 30, decidedBy: "tiebreaker" };

    const outcome = tiebreakerOutcome(board, scores, weeklyWin)!;
    expect(tiebreakerSentence(outcome)).toBe(
      "Tiebreaker Guess: Ohio State at Texas finished 59. Jonah guessed 40 (off by 19) and Grandma did not guess — Jonah closest.",
    );
  });

  test("nobody in the tie guessed at all, so it's shared", () => {
    const board = reveal([{ ...texas, picks: [] }], texas.game.id);
    const scores = [score(GRANDMA, 30, { tiebreakerGuess: null }), score(JONAH, 30, { tiebreakerGuess: null })];
    const weeklyWin: WeeklyWin = { winners: [GRANDMA, JONAH], points: 30, decidedBy: "shared" };

    expect(tiebreakerSentence(tiebreakerOutcome(board, scores, weeklyWin))).toBe(
      "Tiebreaker Guess: Ohio State at Texas finished 59. Grandma did not guess and Jonah did not guess — nobody in the tie guessed, so it's shared.",
    );
  });

  test("two guesses equally close share it, each shown for what it actually was", () => {
    const board = reveal([{ ...texas, picks: [] }], texas.game.id);
    const scores = [
      score(GRANDMA, 30, { tiebreakerGuess: 55, tiebreakerError: 4 }),
      score(JONAH, 30, { tiebreakerGuess: 63, tiebreakerError: 4 }),
    ];
    const weeklyWin: WeeklyWin = { winners: [GRANDMA, JONAH], points: 30, decidedBy: "shared" };

    expect(tiebreakerSentence(tiebreakerOutcome(board, scores, weeklyWin))).toBe(
      "Tiebreaker Guess: Ohio State at Texas finished 59. Grandma guessed 55 (off by 4) and Jonah guessed 63 (off by 4) — Grandma and Jonah level, closest of the group.",
    );
  });

  test("says which of pending and void it is, and nothing at all without a tiebreaker game", () => {
    const weeklyWin: WeeklyWin = { winners: [GRANDMA], points: 0, decidedBy: "points" };
    const open = view(1, "Ohio State", "Texas");
    const openBoard = reveal([{ ...open, picks: [] }], open.game.id);
    const scores = [score(GRANDMA, 0, { tiebreakerGuess: 55 })];
    expect(tiebreakerSentence(tiebreakerOutcome(openBoard, scores, weeklyWin))).toBe(
      "Tiebreaker Guess: Ohio State at Texas is not final yet.",
    );

    const voided = view(1, "Ohio State", "Texas", VOID);
    const voidBoard = reveal([{ ...voided, picks: [] }], voided.game.id);
    expect(tiebreakerSentence(tiebreakerOutcome(voidBoard, scores, weeklyWin))).toBe(
      "Tiebreaker Guess: Ohio State at Texas is void, so no Guess counts this week.",
    );

    expect(tiebreakerOutcome(reveal([{ ...texas, picks: [] }], null), scores, weeklyWin)).toBeNull();
    // A Week naming a Tiebreaker Game that is not on the board it was handed.
    expect(tiebreakerOutcome(reveal([{ ...texas, picks: [] }], 999), scores, weeklyWin)).toBeNull();
    expect(tiebreakerSentence(null)).toBeNull();
  });
});

describe("one member's own week", () => {
  test("transposes the board into their picks, in slate order, marking the games they skipped", () => {
    const michigan = view(1, "Oklahoma", "Michigan", final(24, 27));
    const texas = view(2, "Ohio State", "Texas", final(31, 28));
    const miami = view(3, "FAMU", "Miami", VOID);
    const board = reveal(
      [
        { ...michigan, picks: [pick(GRANDMA, michigan.game.homeTeamId, { lock: "counts" })] },
        { ...texas, picks: [pick(JONAH, texas.game.homeTeamId, { outcome: "incorrect" })] },
        { ...miami, picks: [pick(GRANDMA, miami.game.homeTeamId, { outcome: "void", lock: "dropped" })] },
      ],
      texas.game.id,
    );

    const mine = pickBreakdown(board, GRANDMA.id);

    expect(mine.map((row) => [row.game.game.id, row.pick?.outcome ?? null, row.tiebreaker])).toEqual([
      [michigan.game.id, "correct", false],
      // Grandma never picked Texas: the row is still hers to see, with no pick on it.
      [texas.game.id, null, true],
      [miami.game.id, "void", false],
    ]);
    expect(mine[0].pick!.lock).toBe("counts");
    expect(mine[2].pick!.lock).toBe("dropped");
  });
});

describe("the leaderboard's own columns", () => {
  test("an average is one decimal, and an em dash before the first week played", () => {
    expect(averageLabel(null)).toBe("—");
    expect(averageLabel(30)).toBe("30");
    expect(averageLabel(80 / 3)).toBe("26.7");
    expect(averageLabel(0)).toBe("0");
  });

  test("a climb up the board is a fall in the rank number", () => {
    expect(movement({ rank: 1, previousRank: 3 })).toEqual({
      direction: "up",
      places: 2,
      label: "Up 2 places, from 3rd",
    });
    expect(movement({ rank: 4, previousRank: 3 })).toEqual({
      direction: "down",
      places: 1,
      label: "Down 1 place, from 3rd",
    });
  });

  test("a member who moved nowhere, and one with nowhere to have moved from, both say nothing", () => {
    expect(movement({ rank: 2, previousRank: 2 })).toBeNull();
    // The season's first week, and a member whose first counted week is this one.
    expect(movement({ rank: 2, previousRank: null })).toBeNull();
  });

  test("the ordinal in the label survives the teens, where the naive rule does not", () => {
    expect(movement({ rank: 10, previousRank: 11 })!.label).toBe("Up 1 place, from 11th");
    expect(movement({ rank: 22, previousRank: 21 })!.label).toBe("Down 1 place, from 21st");
  });
});
