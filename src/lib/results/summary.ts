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

/**
 * Played Weeks first, then points descending, then Tiebreaker Guess closeness:
 * the engine's own week order, from `compareWeekly` in `score-week.ts`.
 *
 * The first clause is what keeps a place number agreeing with the row it sits
 * on. Without it, a member who sat the week out would *share* a place with one
 * who picked and scored nothing — the two are level on points and on a
 * Tiebreaker error neither has — while the engine still sorted them below, so
 * the list would read in an order its own numbers did not explain.
 */
function finishedAhead(a: WeeklyScore, b: WeeklyScore): boolean {
  if (a.played !== b.played) return a.played;
  if (a.points !== b.points) return a.points > b.points;
  return (a.tiebreakerError ?? Infinity) < (b.tiebreakerError ?? Infinity);
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
 * One member's place in a Week. Counted as "everybody strictly ahead of me,
 * plus one" rather than as a row index, so two members who are level share a
 * place instead of one of them being told they lost on read order.
 *
 * Null when the member was not on the Week's board at all — they joined after
 * its Deadline, and a place in a week they never had a chance at is not a fair
 * thing to show them. A member who was here and picked nothing *is* on the
 * board, so they get a place, at the bottom.
 */
export function standing(scores: WeeklyScore[], memberId: number): Standing | null {
  const mine = scores.find((s) => s.member.id === memberId);
  if (!mine) return null;
  const place = scores.filter((s) => finishedAhead(s, mine)).length + 1;
  return { place, of: scores.length, label: `${ordinal(place)} of ${scores.length}` };
}

/** Where a member stands in the season, and what they have scored getting there. */
export interface SeasonStanding extends Standing {
  /**
   * Season total. A Week whose Deadline has passed is a played Week even while
   * its games are going (`playedWeeks`), so on a Saturday this already carries
   * the Week in progress at its provisional value — which is the whole point
   * of showing it on the Live Board: it is the figure that moves.
   */
  points: number;
}

/**
 * One member's place in the season, read off the Leaderboard the engine has
 * already ranked rather than ranked again here. The season tiebreaks are
 * `scoreSeason`'s to apply, and applying them a second time in a helper is how
 * the board and this card would come to disagree.
 *
 * Null for a member the board does not carry at all — one deactivated with no
 * Picks anywhere in the season. A member who has simply played no Week yet is
 * on the board at zero and gets their place like anyone else, which is what
 * keeps them from vanishing the moment they skip a week.
 */
export function seasonStanding(leaderboard: LeaderboardRow[], memberId: number): SeasonStanding | null {
  const mine = leaderboard.find((row) => row.member.id === memberId);
  if (!mine) return null;
  const of = leaderboard.length;
  return { place: mine.rank, of, label: `${ordinal(mine.rank)} of ${of}`, points: mine.totalPoints };
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

/** One member tied for the week's lead by points: their Guess and its error, once the Tiebreaker Game is final. */
export interface TiebreakerContender {
  member: ScoredMember;
  guess: number | null;
  /** Absolute error against the combined final score; null until the game is final, or if they never guessed. */
  error: number | null;
}

/** The Tiebreaker Game and what it settled. */
export interface TiebreakerOutcome {
  game: GameView;
  /** Combined final score of the two teams. Null until the game is final, and for a Void. */
  combined: number | null;
  /**
   * Everyone tied for the week's lead by points, closest Guess first. Empty
   * when a single member led outright: nobody's placement turned on the
   * Guess, so there is no group for this sentence to name. This is the same
   * points-tied group `decideWeeklyWin` (score-week.ts) resolves — recomputed
   * here from `weeklyWin.points` rather than threaded through, since a Week's
   * screens already hold both.
   */
  contenders: TiebreakerContender[];
  /** The contenders who actually won the week: more than one only when the Guess also tied, or nobody in the group guessed. */
  winners: ScoredMember[];
}

/**
 * The Tiebreaker Game's outcome, from the board and the scores of one graded
 * pass. Null when the Week has no Tiebreaker Game, when the one it names is
 * not on the Slate, or when nobody played the Week.
 */
export function tiebreakerOutcome(reveal: Reveal, scores: WeeklyScore[], weeklyWin: WeeklyWin | null): TiebreakerOutcome | null {
  const { tiebreakerGameId } = reveal.week;
  if (tiebreakerGameId === null) return null;
  const game = reveal.games.find((g) => g.game.id === tiebreakerGameId);
  if (!game) return null;
  const { shown, status } = game.result;
  const combined = status === "final" && shown ? shown.homeScore + shown.awayScore : null;
  // Played only. A member who made no Pick sits at zero, so a week won on zero
  // points would otherwise sweep them into the tie and name them as a
  // contender in a tiebreak they were never in.
  const tied = weeklyWin === null ? [] : scores.filter((s) => s.played && s.points === weeklyWin.points);
  if (tied.length < 2) return { game, combined, contenders: [], winners: [] };
  const contenders = [...tied]
    .sort((a, b) => (a.tiebreakerError ?? Infinity) - (b.tiebreakerError ?? Infinity))
    .map((s) => ({ member: s.member, guess: s.tiebreakerGuess, error: s.tiebreakerError }));
  return { game, combined, contenders, winners: weeklyWin!.winners };
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
 * Average Tiebreaker Guess miss, to one decimal, same rounding as `averageLabel`.
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
