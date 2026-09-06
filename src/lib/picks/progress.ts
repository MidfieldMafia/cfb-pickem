/**
 * How much of a Week a member has left before the Deadline, counted in one
 * place. There used to be three counts: `/week` counted Picks, the pick flow
 * counted Picks with its own idea of a failed save, and `/picks/review`
 * counted Picks plus the Lock of the Week plus the Tiebreaker Guess. A member
 * with every Pick in and no Lock was told two different things on two screens.
 *
 * Kept free of database imports, like `limits.ts`, so the client screens can
 * count the state they hold in the browser with the very same function.
 */
import { plural } from "@/lib/plural";

/** The least of a Game these counts need: enough to apply the Void rule. */
export interface CountableGame {
  id: number;
  void: boolean;
}

/** What is left before the Deadline. */
export interface SheetProgress {
  /** Games that still count: the slate minus its Void games. */
  liveGames: number;
  /** Live games the member has a Pick in. */
  picksMade: number;
  /** True when a Lock of the Week counts this week. A Dropped Lock does not. */
  lockSet: boolean;
  /** True when the Tiebreaker Guess is in. */
  guessSet: boolean;
  /**
   * The things still to do, 0 to 3: every Pick made, the Lock set, the Guess
   * entered. Open Picks are one thing however many games are open, so this
   * number is the one the screens say out loud.
   */
  remaining: number;
}

/** The games that still count. The Void rule is applied here, not on the screens. */
export function liveGames<G extends CountableGame>(games: readonly G[]): G[] {
  return games.filter((g) => !g.void);
}

/** The first live Game with no Pick: where "keep picking" sends the member. */
export function firstOpenGame<G extends CountableGame>(
  games: readonly G[],
  picked: (gameId: number) => boolean,
): G | undefined {
  return liveGames(games).find((g) => !picked(g.id));
}

/**
 * The counts behind every "how much is left" line in the app.
 *
 * A Pick counts only once the server has it: `pickSheet` counts the rows the
 * database holds, and the pick flow reports only its saved local picks, so a
 * save still in flight — or one that failed — leaves its Game open on every
 * screen rather than on just the one that noticed.
 */
export function sheetProgress({
  games,
  picked,
  lockGameId,
  lockDropped,
  tiebreakerGuess,
}: {
  games: readonly CountableGame[];
  picked: (gameId: number) => boolean;
  lockGameId: number | null;
  lockDropped: boolean;
  tiebreakerGuess: number | null;
}): SheetProgress {
  const live = liveGames(games);
  const picksMade = live.filter((g) => picked(g.id)).length;
  const lockSet = lockGameId !== null && !lockDropped;
  const guessSet = tiebreakerGuess !== null;
  // A Lock needs a live game to sit on, so a wholly voided slate leaves none to set.
  const lockOpen = live.length > 0 && !lockSet;
  return {
    liveGames: live.length,
    picksMade,
    lockSet,
    guessSet,
    remaining: (picksMade < live.length ? 1 : 0) + (lockOpen ? 1 : 0) + (guessSet ? 0 : 1),
  };
}

/** The one sentence for what is left, said the same way on `/week` and `/picks/review`. */
export function remainingLabel(progress: SheetProgress, weekNumber: number, locked: boolean): string {
  if (locked) return `Week ${weekNumber} is in the books`;
  if (progress.remaining === 0) return `You're all set for Week ${weekNumber}`;
  return `${plural(progress.remaining, "thing")} left before the deadline`;
}
