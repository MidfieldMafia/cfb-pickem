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
 * or made no Pick in it — and a place in a week they did not play is not a fair
 * thing to show them.
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
  const tied = weeklyWin === null ? [] : scores.filter((s) => s.points === weeklyWin.points);
  if (tied.length < 2) return { game, combined, contenders: [], winners: [] };
  const contenders = [...tied]
    .sort((a, b) => (a.tiebreakerError ?? Infinity) - (b.tiebreakerError ?? Infinity))
    .map((s) => ({ member: s.member, guess: s.tiebreakerGuess, error: s.tiebreakerError }));
  return { game, combined, contenders, winners: weeklyWin!.winners };
}

/**
 * What the Tiebreaker Game settled, in words: the matchup, its combined
 * score, and — only when a points tie actually needed the Guess to settle it
 * — every tied member's Guess and how far off it was. Null when the Week
 * named no Tiebreaker Game, so the line is one condition on the screen.
 *
 * A single leader by points (`contenders` empty) gets no claim about a
 * closest Guess: nobody's placement depended on one, and naming a "closest"
 * anyway is what made this sentence disagree with the Weekly Win line above
 * it in the first place — the two must always agree, because they are
 * describing the same tiebreak.
 *
 * A Void, or a game still to finish, has no combined score to measure a Guess
 * against — the engine leaves every Tiebreaker error null until it does — so
 * the sentence says which of those it is rather than implying a decision that
 * has not happened.
 */
export function tiebreakerSentence(outcome: TiebreakerOutcome | null): string | null {
  if (outcome === null) return null;
  const { game, combined, contenders, winners } = outcome;
  const matchup = `${game.game.awayTeam} at ${game.game.homeTeam}`;
  if (combined === null) {
    return game.result.status === "void"
      ? `Tiebreaker Guess: ${matchup} is void, so no Guess counts this week.`
      : `Tiebreaker Guess: ${matchup} is not final yet.`;
  }
  const finished = `Tiebreaker Guess: ${matchup} finished ${combined}.`;
  if (contenders.length === 0) return finished;
  const said = contenders.map((c) =>
    c.guess === null ? `${c.member.displayName} did not guess` : `${c.member.displayName} guessed ${c.guess} (off by ${c.error})`,
  );
  const guessed = contenders.filter((c) => c.guess !== null);
  const decided =
    guessed.length === 0
      ? "nobody in the tie guessed, so it's shared"
      : winners.length === 1
        ? `${winners[0].displayName} closest`
        : `${listNames(winners)} level, closest of the group`;
  return `${finished} ${andJoin(said)} — ${decided}.`;
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
 * How much of the season a member has actually played, said out loud only
 * when it is less than the season has run: "2 of 3 weeks".
 *
 * A member who joined in Week 3 sits out Weeks 1 and 2, and a member who picked
 * nothing in Week 4 sits that one out too (`roster`, and the engine's
 * `playedWeek`), so their total is over fewer weeks than the member above them.
 * Their average already accounts for it; this is the note that stops the total
 * looking like a losing one. Null when they have played every week the season
 * has.
 */
export function weeksPlayedNote(
  row: Pick<LeaderboardRow, "weeksPlayed">,
  weeksInSeason: number,
): string | null {
  if (weeksInSeason === 0 || row.weeksPlayed >= weeksInSeason) return null;
  return `${row.weeksPlayed} of ${plural(weeksInSeason, "week")}`;
}
