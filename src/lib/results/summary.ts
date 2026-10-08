/**
 * What the season screens say about a graded Week: a member's record, where
 * they finished, how the Weekly Win was decided, what the Tiebreaker Game did,
 * and one member's own week game by game. Vocabulary follows GLOSSARY.md.
 *
 * Kept free of database imports, like `picks/progress.ts` and
 * `results/result.ts`. Everything here works on the wire shapes a screen is
 * already holding, which buys two things: the Leaderboard and the week results
 * screen say the same thing the same way, and the wording is testable without
 * a database — no screen is left deciding between "took" and "shared", or
 * dividing to get an average, inside JSX.
 *
 * The per-pick breakdown here is the Reveal transposed, not a second copy of
 * it: `WeeklyScore` deliberately carries no picks (see `results.ts`), so a
 * member's own row cannot drift from the board it sits under.
 */
import { plural } from "@/lib/plural";
import type { GameView } from "@/lib/slate/json";
import type {
  LeaderboardRow,
  Reveal,
  RevealPick,
  ScoredMember,
  WeeklyScore,
  WeeklyWin,
} from "./results";

/** "8–1", with the en dash the type scale asks for. Wins and losses only; a Void is neither. */
export function record(correct: number, incorrect: number): string {
  return `${correct}–${incorrect}`;
}

/**
 * The share of graded picks that were correct, from 0 to 1, or null before any
 * was graded. A Void is neither, as in `record`, so it moves the rate neither way.
 */
export function winRate(correct: number, incorrect: number): number | null {
  const graded = correct + incorrect;
  return graded === 0 ? null : correct / graded;
}

/** "62%", `winRate` to the whole percent; an em dash before the first graded pick. */
export function winRateLabel(correct: number, incorrect: number): string {
  const rate = winRate(correct, incorrect);
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

/** "1st", "2nd", "3rd", "4th" — and "11th", "21st", where the naive rule gets it wrong. */
export function ordinal(place: number): string {
  const teens = place % 100;
  if (teens >= 11 && teens <= 13) return `${place}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[place % 10] ?? "th";
  return `${place}${suffix}`;
}

/**
 * One member's Tiebreaker Guess, in the words a row can show beside a place
 * that Guess may have decided: "No guess", "Guessed 49" while the Tiebreaker
 * Game is still to finish, "Guessed 49 · off by 2" once it has.
 */
export function guessLabel(score: Pick<WeeklyScore, "tiebreakerGuess" | "tiebreakerError">): string {
  if (score.tiebreakerGuess === null) return "No guess";
  if (score.tiebreakerError === null) return `Guessed ${score.tiebreakerGuess}`;
  return `Guessed ${score.tiebreakerGuess} · off by ${score.tiebreakerError}`;
}

/** "a", "a and b", "a, b and c". */
function andJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "Grandma", "Grandma and Jonah", "Grandma, Jonah and Alex". */
function listNames(members: ScoredMember[]): string {
  return andJoin(members.map((m) => m.displayName));
}

/** Where a member came in a Week, and how many were on its board. */
export interface Standing {
  /** 1-based. Members level on points and on Tiebreaker Guess closeness share a place. */
  place: number;
  /**
   * Everyone the Week put on the board, including members who made no Pick and
   * so did not play it. They are shown on the week's screens at zero, so the
   * count a place is read against is the rows on screen.
   */
  of: number;
  /** "4th of 5". */
  label: string;
}

/**
 * One member's place in a Week, as the engine placed them: two members who are
 * level share a place instead of one of them being told they lost on read order.
 *
 * Null when the member was not on the Week's board at all — they joined after
 * its Deadline, and a place in a week they never had a chance at is not a fair
 * thing to show them. A member who was here and picked nothing *is* on the
 * board, so they get a place, at the bottom.
 */
export function standing(scores: WeeklyScore[], memberId: number): Standing | null {
  const mine = scores.find((s) => s.member.id === memberId);
  if (!mine) return null;
  return { place: mine.place, of: scores.length, label: `${ordinal(mine.place)} of ${scores.length}` };
}

/**
 * The one line about who won the Week: how the engine decided it, in words.
 *
 * An incomplete Week has a leader rather than a winner — `complete` is the
 * engine's "every non-void game is final", and only then does a Weekly Win
 * count toward the season — so the tense is decided here rather than by each
 * screen guessing from the presence of a winner.
 *
 * Null when nobody played the Week, which is the same condition as a null
 * Weekly Win.
 */
export function weeklyWinSentence(win: WeeklyWin | null, complete: boolean): string | null {
  if (win === null) return null;
  const who = listNames(win.winners);
  if (!complete) {
    return win.winners.length > 1
      ? `${who} lead with ${win.points}`
      : `${who} leads with ${win.points}`;
  }
  switch (win.decidedBy) {
    case "points":
      return `${who} took the week with ${win.points}`;
    case "tiebreaker":
      return `${who} took the week with ${win.points}, closest on the Tiebreaker Guess`;
    case "shared":
      return `${who} shared the week at ${win.points}`;
  }
}

/**
 * Who wears the Weekly Win badge on the week's board: nobody until the Week is
 * complete. Mid-Saturday the engine's winners are only the leaders, and
 * `weeklyWinSentence` already says "leads with" for them — a badge would
 * crown them early, which is why the season Trophy waits for `seasonChampion`.
 */
export function weeklyWinners(win: WeeklyWin | null, complete: boolean): Set<number> {
  return new Set(complete ? (win?.winners.map((m) => m.id) ?? []) : []);
}

/**
 * The members tied for the lead on points, whose Guesses decide the Weekly Win:
 * the engine's `contenders`, so none in a Week with no Tiebreaker Game to measure against.
 */
export function weeklyContenders(win: WeeklyWin | null): Set<number> {
  return new Set(win?.contenders.map((m) => m.id) ?? []);
}

/**
 * Every member who played the Week, in the order a Tiebreaker Guesses card
 * lists them, wherever it is shown.
 *
 * Played only, as the Weekly Win is: a Guess alone does not make a Played
 * Week, so a member who guessed and picked nothing is not in this tiebreak.
 *
 * Closest Guess first. Before the game is final there is no error to rank by,
 * so the Guesses keep the order `scores` arrived in: the week's standings.
 * Either way, a member who made no Guess sorts last: the engine scores a
 * missing Guess as 0, so after the final it carries an error that could rank
 * it above real Guesses.
 */
export function guessOrder(scores: WeeklyScore[]): WeeklyScore[] {
  const noGuess = (s: WeeklyScore) => Number(s.tiebreakerGuess === null);
  return scores
    .filter((s) => s.played)
    .sort((a, b) => noGuess(a) - noGuess(b) || (a.tiebreakerError ?? 0) - (b.tiebreakerError ?? 0));
}

/** One row of the Reveal's Tiebreaker Guesses card. */
export interface TiebreakerGuessRow {
  score: WeeklyScore;
  /** Tied for first on points, so this Guess is one that decided the Weekly Win. */
  contender: boolean;
}

/**
 * The Reveal's card: `guessOrder`, with the members tied for first marked as
 * `contender` where their closeness puts them.
 */
export function tiebreakerGuesses(scores: WeeklyScore[], weeklyWin: WeeklyWin | null): TiebreakerGuessRow[] {
  const contenders = weeklyContenders(weeklyWin);
  return guessOrder(scores).map((score) => ({ score, contender: contenders.has(score.member.id) }));
}

/** One Game as one member played it: the pick-history row. */
export interface BreakdownRow {
  game: GameView;
  /** The member's Pick, graded, or null when they never picked this Game. */
  pick: RevealPick | null;
  tiebreaker: boolean;
}

/**
 * One member's Week, game by game, in Slate order: what a member browsing
 * their own past weeks reads. The Reveal holds the same grading per game
 * rather than per member, so this transposes it instead of grading again.
 */
export function pickBreakdown(reveal: Reveal, memberId: number): BreakdownRow[] {
  return reveal.games.map((row) => ({
    game: row,
    pick: row.picks.find((p) => p.memberId === memberId) ?? null,
    tiebreaker: row.game.id === reveal.week.tiebreakerGameId,
  }));
}

/**
 * Average Tiebreaker Guess miss, to one decimal.
 * An em dash before a member has a completed week they actually guessed on —
 * distinct from having simply played, since a skipped Guess leaves no miss to average.
 */
export function tiebreakerMissLabel(averageTiebreakerMiss: number | null): string {
  if (averageTiebreakerMiss === null) return "—";
  return String(Math.round(averageTiebreakerMiss * 10) / 10);
}

/** Which way a member's rank moved, and by how far. */
export interface Movement {
  direction: "up" | "down";
  /** Places moved. Always positive; `direction` carries the sign. */
  places: number;
  /** "Up 2 places, from 3rd" — what the glyph says out loud to a screen reader. */
  label: string;
}

/**
 * How a member's rank moved since the board before the latest played week.
 *
 * Null for a member who did not move, which is the same answer as for one who
 * has no earlier place to have moved from — the season's first week, or a
 * member whose first counted week is the latest one. The Leaderboard shows
 * movers only, so all three read as a row with nothing to say about movement,
 * and only the engine's `previousRank` distinguishes them.
 *
 * A lower rank number is a better place, so a fall in the number is a climb up
 * the board: the arithmetic is inverted here rather than in JSX.
 */
export function movement(row: Pick<LeaderboardRow, "rank" | "previousRank">): Movement | null {
  const { rank, previousRank } = row;
  if (previousRank === null || previousRank === rank) return null;
  const up = rank < previousRank;
  const places = Math.abs(previousRank - rank);
  return {
    direction: up ? "up" : "down",
    places,
    label: `${up ? "Up" : "Down"} ${plural(places, "place")}, from ${ordinal(previousRank)}`,
  };
}

/**
 * The member who won the season, or null while there is nobody to crown: the
 * season's final Week has not been played to completion, or first place is
 * shared. A shared first is not crowned for the reason a level board is not
 * (see the Leaderboard's Trophy): the honest answer is no champion, and it
 * cannot degenerate into crowning everyone.
 *
 * Takes the played Weeks and the final Week's number rather than a clock, so
 * "the season is over" is read off the same graded Weeks the board is.
 */
export function seasonChampion(
  leaderboard: LeaderboardRow[],
  weeks: { week: { weekNumber: number }; complete: boolean }[],
  finalWeekNumber: number,
): number | null {
  const final = weeks.find((w) => w.week.weekNumber === finalWeekNumber);
  if (!final?.complete) return null;
  const leaders = leaderboard.filter((row) => row.rank === 1);
  return leaders.length === 1 ? leaders[0].member.id : null;
}

/**
 * What the Leaderboard's subtitle says about how far the season has got. A
 * Week whose Deadline has passed is already on the board at its provisional
 * value, so while it is still being played "after Week N" claims a finished
 * week that is not — say it is in progress instead.
 */
export function seasonStatusLabel(latest: { week: { weekNumber: number }; complete: boolean } | undefined): string {
  if (!latest) return "before Week 1";
  return latest.complete ? `through Week ${latest.week.weekNumber}` : `Week ${latest.week.weekNumber} in progress`;
}
