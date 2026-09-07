import { describe, expect, test } from "vitest";
import type { GameResult } from "./result";
import type { Reveal, RevealGame, RevealPick, ScoredMember, WeeklyScore, WeeklyWin } from "./results";
import type { GameJson, GameView } from "@/lib/slate/json";
import {
  averageLabel,
  movement,
  ordinal,
  pickBreakdown,
  record,
  standing,
  tiebreakerOutcome,
  tiebreakerSentence,
  weeklyWinSentence,
  weeksPlayedNote,
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

function score(who: ScoredMember, points: number, over: Partial<WeeklyScore> = {}): WeeklyScore {
  return {
    member: who,
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
  return { memberId: who.id, teamId, outcome: "correct", locked: false, lockDropped: false, ...over };
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

  test("breaks a level score by tiebreaker closeness, and has no place for a member who sat the week out", () => {
    const scores = [score(GRANDMA, 30, { tiebreakerError: 2 }), score(JONAH, 30, { tiebreakerError: 9 })];

    expect(standing(scores, GRANDMA.id)!.place).toBe(1);
    expect(standing(scores, JONAH.id)!.place).toBe(2);
    // A member who joined after the Deadline is not in the scores at all.
    expect(standing(scores, ALEX.id)).toBeNull();
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

  test("measures the closest guess against the combined final score", () => {
    const board = reveal([{ ...texas, picks: [] }], texas.game.id);
    const scores = [
      score(GRANDMA, 30, { tiebreakerGuess: 55, tiebreakerError: 4 }),
      score(JONAH, 20, { tiebreakerGuess: 70, tiebreakerError: 11 }),
    ];

    const outcome = tiebreakerOutcome(board, scores)!;
    expect(outcome.combined).toBe(59);
    expect(outcome.closest.map((m) => m.displayName)).toEqual(["Grandma"]);
    expect(outcome.guess).toBe(55);
    expect(tiebreakerSentence(outcome)).toBe(
      "Tiebreaker Guess: Ohio State at Texas finished 59. Grandma guessed 55, closest of the group.",
    );
  });

  test("a member who never guessed is not the closest guess of the group", () => {
    const board = reveal([{ ...texas, picks: [] }], texas.game.id);
    // The engine counts a missing Guess as 0, which is right for scoring and
    // would read as a guess of 0 here.
    const scores = [score(GRANDMA, 30, { tiebreakerGuess: null, tiebreakerError: 59 })];

    const outcome = tiebreakerOutcome(board, scores)!;
    expect(outcome.closest).toEqual([]);
    expect(outcome.guess).toBeNull();
    expect(tiebreakerSentence(outcome)).toBe(
      "Tiebreaker Guess: Ohio State at Texas finished 59. Nobody guessed.",
    );
  });

  test("two guesses equally close share it", () => {
    const board = reveal([{ ...texas, picks: [] }], texas.game.id);
    const scores = [
      score(GRANDMA, 30, { tiebreakerGuess: 55, tiebreakerError: 4 }),
      score(JONAH, 30, { tiebreakerGuess: 63, tiebreakerError: 4 }),
    ];

    expect(tiebreakerSentence(tiebreakerOutcome(board, scores))).toBe(
      "Tiebreaker Guess: Ohio State at Texas finished 59. Grandma and Jonah guessed 55, level and closest of the group.",
    );
  });

  test("says which of pending and void it is, and nothing at all without a tiebreaker game", () => {
    const open = view(1, "Ohio State", "Texas");
    const openBoard = reveal([{ ...open, picks: [] }], open.game.id);
    const scores = [score(GRANDMA, 0, { tiebreakerGuess: 55 })];
    expect(tiebreakerSentence(tiebreakerOutcome(openBoard, scores))).toBe(
      "Tiebreaker Guess: Ohio State at Texas is not final yet.",
    );

    const voided = view(1, "Ohio State", "Texas", VOID);
    const voidBoard = reveal([{ ...voided, picks: [] }], voided.game.id);
    expect(tiebreakerSentence(tiebreakerOutcome(voidBoard, scores))).toBe(
      "Tiebreaker Guess: Ohio State at Texas is void, so no Guess counts this week.",
    );

    expect(tiebreakerOutcome(reveal([{ ...texas, picks: [] }], null), scores)).toBeNull();
    // A Week naming a Tiebreaker Game that is not on the board it was handed.
    expect(tiebreakerOutcome(reveal([{ ...texas, picks: [] }], 999), scores)).toBeNull();
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
        { ...michigan, picks: [pick(GRANDMA, michigan.game.homeTeamId, { locked: true })] },
        { ...texas, picks: [pick(JONAH, texas.game.homeTeamId, { outcome: "incorrect" })] },
        { ...miami, picks: [pick(GRANDMA, miami.game.homeTeamId, { outcome: "void", lockDropped: true })] },
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
    expect(mine[0].pick!.locked).toBe(true);
    expect(mine[2].pick!.lockDropped).toBe(true);
  });
});

describe("the leaderboard's own columns", () => {
  test("an average is one decimal, and an em dash before the first week played", () => {
    expect(averageLabel(null)).toBe("—");
    expect(averageLabel(30)).toBe("30");
    expect(averageLabel(80 / 3)).toBe("26.7");
    expect(averageLabel(0)).toBe("0");
  });

  test("a late joiner's weeks are said out loud, and a full season's are not", () => {
    expect(weeksPlayedNote({ weeksPlayed: 2 }, 3)).toBe("2 of 3 weeks");
    expect(weeksPlayedNote({ weeksPlayed: 1 }, 2)).toBe("1 of 2 weeks");
    expect(weeksPlayedNote({ weeksPlayed: 1 }, 1)).toBeNull();
    expect(weeksPlayedNote({ weeksPlayed: 3 }, 3)).toBeNull();
    expect(weeksPlayedNote({ weeksPlayed: 0 }, 0)).toBeNull();
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
