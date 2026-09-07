/**
 * What the season screens say about a graded Week: a member's record, where
 * they finished, how the Weekly Win was decided, what the Tiebreaker Game did,
 * and one member's own week game by game. Vocabulary follows CONTEXT.md.
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

/** "1st", "2nd", "3rd", "4th" — and "11th", "21st", where the naive rule gets it wrong. */
export function ordinal(place: number): string {
  const teens = place % 100;
  if (teens >= 11 && teens <= 13) return `${place}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[place % 10] ?? "th";
  return `${place}${suffix}`;
}

/** "Grandma", "Grandma and Jonah", "Grandma, Jonah and Alex". */
function listNames(members: ScoredMember[]): string {
  const names = members.map((m) => m.displayName);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Points descending, then Tiebreaker Guess closeness: the engine's own week order. */
function finishedAhead(a: WeeklyScore, b: WeeklyScore): boolean {
  if (a.points !== b.points) return a.points > b.points;
  return (a.tiebreakerError ?? Infinity) < (b.tiebreakerError ?? Infinity);
}

/** Where a member came in a Week, and how many played it. */
export interface Standing {
  /** 1-based. Members level on points and on Tiebreaker Guess closeness share a place. */
  place: number;
  of: number;
  /** "4th of 5". */
  label: string;
}

/**
 * One member's place in a Week. Counted as "everybody strictly ahead of me,
 * plus one" rather than as a row index, so two members who are level share a
 * place instead of one of them being told they lost on read order.
 *
 * Null when the member did not play the Week — they joined after its Deadline,
 * and a place in a week they never had a chance at is not a fair thing to show
 * them.
 */
export function standing(scores: WeeklyScore[], memberId: number): Standing | null {
  const mine = scores.find((s) => s.member.id === memberId);
  if (!mine) return null;
  const place = scores.filter((s) => finishedAhead(s, mine)).length + 1;
  return { place, of: scores.length, label: `${ordinal(place)} of ${scores.length}` };
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

/** The Tiebreaker Game and what it settled. */
export interface TiebreakerOutcome {
  game: GameView;
  /** Combined final score of the two teams. Null until the game is final, and for a Void. */
  combined: number | null;
  /**
   * The members whose Guess came closest, once there is a combined score to
   * measure against. Only members who actually guessed: the engine counts a
   * missing Guess as 0, which is right for scoring and would be wrong to
   * call the closest guess of the group.
   */
  closest: ScoredMember[];
  /** The closest Guess itself, null when nobody guessed. */
  guess: number | null;
}

/**
 * The Tiebreaker Game's outcome, from the board and the scores of one graded
 * pass. Null when the Week has no Tiebreaker Game, or when the one it names is
 * not on the Slate.
 */
export function tiebreakerOutcome(reveal: Reveal, scores: WeeklyScore[]): TiebreakerOutcome | null {
  const { tiebreakerGameId } = reveal.week;
  if (tiebreakerGameId === null) return null;
  const game = reveal.games.find((g) => g.game.id === tiebreakerGameId);
  if (!game) return null;
  const { shown, status } = game.result;
  const combined = status === "final" && shown ? shown.homeScore + shown.awayScore : null;
  const guessed = scores.filter((s) => s.tiebreakerGuess !== null && s.tiebreakerError !== null);
  const best = guessed.reduce<number | null>(
    (low, s) => (low === null ? s.tiebreakerError! : Math.min(low, s.tiebreakerError!)),
    null,
  );
  const closest = combined === null || best === null ? [] : guessed.filter((s) => s.tiebreakerError === best);
  return {
    game,
    combined,
    closest: closest.map((s) => s.member),
    guess: closest.length === 0 ? null : closest[0].tiebreakerGuess,
  };
}

/**
 * What the Tiebreaker Game settled, in words: the matchup, its combined
 * score, and who came closest to it. Null when the Week named no Tiebreaker
 * Game, so the line is one condition on the screen.
 *
 * A Void, or a game still to finish, has no combined score to measure a Guess
 * against — the engine leaves every Tiebreaker error null until it does — so
 * the sentence says which of those it is rather than implying a decision that
 * has not happened.
 */
export function tiebreakerSentence(outcome: TiebreakerOutcome | null): string | null {
  if (outcome === null) return null;
  const { game, combined, closest, guess } = outcome;
  const matchup = `${game.game.awayTeam} at ${game.game.homeTeam}`;
  if (combined === null) {
    return game.result.status === "void"
      ? `Tiebreaker Guess: ${matchup} is void, so no Guess counts this week.`
      : `Tiebreaker Guess: ${matchup} is not final yet.`;
  }
  const finished = `Tiebreaker Guess: ${matchup} finished ${combined}.`;
  if (closest.length === 0) return `${finished} Nobody guessed.`;
  const how = closest.length > 1 ? "level and closest of the group" : "closest of the group";
  return `${finished} ${listNames(closest)} guessed ${guess}, ${how}.`;
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
 * Average points per week played, to one decimal and without a trailing
 * ".0" — the column is read down, and "26.7" beside "30" lines up where
 * "26.666666666666668" and "30.0" do not. An em dash before the first week
 * played, which is what a null average means.
 */
export function averageLabel(averagePoints: number | null): string {
  if (averagePoints === null) return "—";
  return String(Math.round(averagePoints * 10) / 10);
}

/**
 * How much of the season a member has actually played, said out loud only
 * when it is less than the season has run: "2 of 3 weeks".
 *
 * A member who joined in Week 3 sits out Weeks 1 and 2 (`roster`, and the
 * engine's `playedWeek`), so their total is over fewer weeks than the member
 * above them. Their average already accounts for it; this is the note that
 * stops the total looking like a losing one. Null when they have played every
 * week the season has.
 */
export function weeksPlayedNote(
  row: Pick<LeaderboardRow, "weeksPlayed">,
  weeksInSeason: number,
): string | null {
  if (weeksInSeason === 0 || row.weeksPlayed >= weeksInSeason) return null;
  return `${row.weeksPlayed} of ${plural(weeksInSeason, "week")}`;
}
