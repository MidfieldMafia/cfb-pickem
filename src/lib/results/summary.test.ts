import { describe, expect, test } from "vitest";
import { finalResult, SCHEDULED, voidResult } from "@/test/game";
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
  movement,
  ordinal,
  pickBreakdown,
  record,
  seasonChampion,
  seasonStatusLabel,
  standing,
  tiebreakerGuesses,
  tiebreakerOutcome,
  weeklyWinners,
  weeklyWinSentence,
  winRate,
  winRateLabel,
} from "./summary";

/*
 * Everything here is db-free by design, so these are the wire shapes a screen
 * holds, built by hand. Two teams per game, ids that read as themselves.
 */

const PENDING = SCHEDULED;
const final = finalResult;
const VOID = voidResult("Postponed to December");

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

function view(id: number, away: string, home: string, result: GameView["result"] = PENDING): GameView {
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

  test("the badge waits for the week to be decided", () => {
    expect(weeklyWinners(win(), false)).toEqual(new Set());
    expect(weeklyWinners(win(), true)).toEqual(new Set([GRANDMA.id]));
    expect(weeklyWinners(win({ winners: [GRANDMA, JONAH], decidedBy: "shared" }), true)).toEqual(
      new Set([GRANDMA.id, JONAH.id]),
    );
    expect(weeklyWinners(null, true)).toEqual(new Set());
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
    expect(outcome.contenders.map((c) => [c.guess, c.error])).toEqual([
      [55, 4],
      [70, 11],
    ]);
  });

  test("a single leader by points needs no Guess to settle anything, so nobody is a contender", () => {
    const board = reveal([{ ...texas, picks: [] }], texas.game.id);
    const scores = [
      score(GRANDMA, 30, { tiebreakerGuess: 55, tiebreakerError: 4 }),
      score(JONAH, 20, { tiebreakerGuess: 59, tiebreakerError: 0 }),
    ];
    const weeklyWin: WeeklyWin = { winners: [GRANDMA], points: 30, decidedBy: "points" };

    const outcome = tiebreakerOutcome(board, scores, weeklyWin)!;
    // Jonah's guess was the closer of the two, but nobody's placement turned
    // on it, so the screens show no Guess at all.
    expect(outcome.contenders).toEqual([]);
    expect(outcome.combined).toBe(59);
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
    expect(outcome.contenders.map((c) => [c.member.displayName, c.guess])).toEqual([
      ["Jonah", 40],
      ["Grandma", null],
    ]);
    expect(outcome.winners.map((m) => m.displayName)).toEqual(["Jonah"]);
  });

  test("nobody in the tie guessed at all, so it's shared", () => {
    const board = reveal([{ ...texas, picks: [] }], texas.game.id);
    const scores = [score(GRANDMA, 30, { tiebreakerGuess: null }), score(JONAH, 30, { tiebreakerGuess: null })];
    const weeklyWin: WeeklyWin = { winners: [GRANDMA, JONAH], points: 30, decidedBy: "shared" };

    const outcome = tiebreakerOutcome(board, scores, weeklyWin)!;
    expect(outcome.contenders.map((c) => c.guess)).toEqual([null, null]);
    expect(outcome.winners.map((m) => m.displayName)).toEqual(["Grandma", "Jonah"]);
  });

  test("two guesses equally close share it, each shown for what it actually was", () => {
    const board = reveal([{ ...texas, picks: [] }], texas.game.id);
    const scores = [
      score(GRANDMA, 30, { tiebreakerGuess: 55, tiebreakerError: 4 }),
      score(JONAH, 30, { tiebreakerGuess: 63, tiebreakerError: 4 }),
    ];
    const weeklyWin: WeeklyWin = { winners: [GRANDMA, JONAH], points: 30, decidedBy: "shared" };

    const outcome = tiebreakerOutcome(board, scores, weeklyWin)!;
    expect(outcome.contenders.map((c) => [c.member.displayName, c.guess, c.error])).toEqual([
      ["Grandma", 55, 4],
      ["Jonah", 63, 4],
    ]);
    expect(outcome.winners.map((m) => m.displayName)).toEqual(["Grandma", "Jonah"]);
  });

  test("has no combined score while the game is pending or void, and nothing at all without a tiebreaker game", () => {
    const weeklyWin: WeeklyWin = { winners: [GRANDMA], points: 0, decidedBy: "points" };
    const open = view(1, "Ohio State", "Texas");
    const openBoard = reveal([{ ...open, picks: [] }], open.game.id);
    const scores = [score(GRANDMA, 0, { tiebreakerGuess: 55 })];
    expect(tiebreakerOutcome(openBoard, scores, weeklyWin)!.combined).toBeNull();

    const voided = view(1, "Ohio State", "Texas", VOID);
    const voidBoard = reveal([{ ...voided, picks: [] }], voided.game.id);
    expect(tiebreakerOutcome(voidBoard, scores, weeklyWin)!.combined).toBeNull();

    expect(tiebreakerOutcome(reveal([{ ...texas, picks: [] }], null), scores, weeklyWin)).toBeNull();
    // A Week naming a Tiebreaker Game that is not on the board it was handed.
    expect(tiebreakerOutcome(reveal([{ ...texas, picks: [] }], 999), scores, weeklyWin)).toBeNull();
  });
});

describe("the Tiebreaker Guesses card", () => {
  const texas = view(1, "Ohio State", "Texas", final(31, 28));
  const board = reveal([{ ...texas, picks: [] }], texas.game.id);
  const KIM = member(4, "Kim");
  const SAM = member(5, "Sam");

  function shown(rows: ReturnType<typeof tiebreakerGuesses>) {
    return rows.map((r) => [r.score.member.displayName, r.contender]);
  }

  test("with one leader, lists every member who played, closest guess first, and nobody stands out", () => {
    const scores = [
      score(GRANDMA, 30, { tiebreakerGuess: 70, tiebreakerError: 11 }),
      score(JONAH, 20, { tiebreakerGuess: 59, tiebreakerError: 0 }),
      score(ALEX, 10, { tiebreakerGuess: 55, tiebreakerError: 4 }),
    ];
    const weeklyWin: WeeklyWin = { winners: [GRANDMA], points: 30, decidedBy: "points" };

    expect(shown(tiebreakerGuesses(board, scores, weeklyWin))).toEqual([
      ["Jonah", false],
      ["Alex", false],
      ["Grandma", false],
    ]);
  });

  test("leaves out members who sat the week out", () => {
    const scores = [
      score(GRANDMA, 30, { tiebreakerGuess: 55, tiebreakerError: 4 }),
      score(JONAH, 0, { played: false }),
    ];
    const weeklyWin: WeeklyWin = { winners: [GRANDMA], points: 30, decidedBy: "points" };

    expect(shown(tiebreakerGuesses(board, scores, weeklyWin))).toEqual([["Grandma", false]]);
  });

  test("marks the members tied for first, in their place by closeness within the full list", () => {
    const scores = [
      score(GRANDMA, 30, { tiebreakerGuess: 55, tiebreakerError: 4 }),
      score(JONAH, 30, { tiebreakerGuess: 70, tiebreakerError: 11 }),
      score(ALEX, 20, { tiebreakerGuess: 59, tiebreakerError: 0 }),
    ];
    const weeklyWin: WeeklyWin = { winners: [GRANDMA], points: 30, decidedBy: "tiebreaker" };

    expect(shown(tiebreakerGuesses(board, scores, weeklyWin))).toEqual([
      ["Alex", false],
      ["Grandma", true],
      ["Jonah", true],
    ]);
  });

  test("members who made no Guess sort last, however small the error the engine gave them", () => {
    // The engine scores a missing Guess as 0, so after the final it carries an
    // error like anyone else's. It is still not a Guess to rank by.
    const scores = [
      score(GRANDMA, 30, { tiebreakerGuess: null, tiebreakerError: 3 }),
      score(JONAH, 20, { tiebreakerGuess: 70, tiebreakerError: 11 }),
      score(ALEX, 10, { tiebreakerGuess: 55, tiebreakerError: 4 }),
    ];
    const weeklyWin: WeeklyWin = { winners: [GRANDMA], points: 30, decidedBy: "points" };

    expect(shown(tiebreakerGuesses(board, scores, weeklyWin))).toEqual([
      ["Alex", false],
      ["Jonah", false],
      ["Grandma", false],
    ]);
  });

  test("before the Tiebreaker Game is final, guesses keep the week's standings order, no-guesses still last", () => {
    const open = view(1, "Ohio State", "Texas");
    const openBoard = reveal([{ ...open, picks: [] }], open.game.id);
    const scores = [
      score(GRANDMA, 30, { tiebreakerGuess: null }),
      score(JONAH, 30, { tiebreakerGuess: 70 }),
      score(ALEX, 20, { tiebreakerGuess: 59 }),
      score(KIM, 10, { tiebreakerGuess: 41 }),
      score(SAM, 0, { played: false }),
    ];
    const weeklyWin: WeeklyWin = { winners: [GRANDMA, JONAH], points: 30, decidedBy: "shared" };

    expect(shown(tiebreakerGuesses(openBoard, scores, weeklyWin))).toEqual([
      ["Jonah", true],
      ["Alex", false],
      ["Kim", false],
      ["Grandma", true],
    ]);
  });

  test("is empty without a Tiebreaker Game", () => {
    const scores = [score(GRANDMA, 30, { tiebreakerGuess: 55 })];
    const weeklyWin: WeeklyWin = { winners: [GRANDMA], points: 30, decidedBy: "points" };
    expect(tiebreakerGuesses(reveal([{ ...texas, picks: [] }], null), scores, weeklyWin)).toEqual([]);
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
  test("a win rate is correct over graded picks, a whole percent, and an em dash before any", () => {
    expect(winRate(0, 0)).toBeNull();
    expect(winRate(3, 1)).toBe(0.75);
    expect(winRateLabel(0, 0)).toBe("—");
    expect(winRateLabel(34, 21)).toBe("62%");
    expect(winRateLabel(0, 5)).toBe("0%");
    expect(winRateLabel(9, 0)).toBe("100%");
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

describe("who has won the season", () => {
  const week = (weekNumber: number, complete: boolean) => ({ week: { weekNumber }, complete });
  const board = [row(JONAH, 1, 90), row(ALEX, 2, 80), row(GRANDMA, 3, 70)];

  test("nobody, however clear the lead, until the final week is complete", () => {
    expect(seasonChampion(board, [week(14, true), week(15, false)], 15)).toBeNull();
  });

  test("nobody when the final week has not been played at all", () => {
    expect(seasonChampion(board, [week(13, true), week(14, true)], 15)).toBeNull();
  });

  test("the sole leader once the final week is complete", () => {
    expect(seasonChampion(board, [week(14, true), week(15, true)], 15)).toBe(JONAH.id);
  });

  test("nobody when first place is shared", () => {
    const tied = [row(JONAH, 1, 90), row(ALEX, 1, 90), row(GRANDMA, 3, 70)];
    expect(seasonChampion(tied, [week(15, true)], 15)).toBeNull();
  });
});

describe("how far the season has got", () => {
  test("before any week is played", () => {
    expect(seasonStatusLabel(undefined)).toBe("before Week 1");
  });

  test("a week still being played is in progress, not finished", () => {
    expect(seasonStatusLabel({ week: { weekNumber: 3 }, complete: false })).toBe("Week 3 in progress");
  });

  test("a finished week is through", () => {
    expect(seasonStatusLabel({ week: { weekNumber: 3 }, complete: true })).toBe("through Week 3");
  });
});
