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
import { isVoid, type GameView } from "@/lib/slate/json";

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
   * True when a Lock of the Week is still to set: none counts yet and the
   * slate has a live game to put one on. Returned rather than left to the
   * screens, which otherwise re-derive it from `lockSet` and `liveGames`.
   */
  lockOpen: boolean;
  /**
   * The things still to do, 0 to 3: every Pick made, the Lock set, the Guess
   * entered. Open Picks are one thing however many games are open, so this
   * number is the one the screens say out loud.
   */
  remaining: number;
}

/**
 * A member's Lock of the Week, in the three states every screen tells apart.
 * One shape, so no reader re-derives "dropped" from a Game and a flag that can
 * drift apart: a Dropped Lock still names its game, because the member keeps
 * it and restoring the game restores it.
 */
export type LockState =
  | { state: "none" }
  | { state: "counts"; gameId: number }
  | { state: "dropped"; gameId: number };

export const NO_LOCK: LockState = { state: "none" };

/**
 * The state of a Lock sitting on `gameId`, read from the slate it is on: the
 * one place a Lock on a Void game becomes a Dropped Lock for the read path.
 *
 * It reads a `GameView`, whose result `toGameView` has already folded through
 * `effectiveResult`, rather than the `void` column: a second opinion on what
 * Void means beside the seam that holds the only one would reach some screens
 * and miss others. A Lock naming a game off the slate counts, as it always has.
 *
 * Graded screens get this from the engine's own `LockResult.dropped` instead,
 * which reads the same folded `void` across `toEngineGame`: one derivation
 * across a bridge, not two.
 */
export function lockOn(games: readonly GameView[], gameId: number | null): LockState {
  if (gameId === null) return NO_LOCK;
  const view = games.find((g) => g.game.id === gameId);
  return view && isVoid(view) ? { state: "dropped", gameId } : { state: "counts", gameId };
}

/** The game a Lock sits on, counting or dropped; null when there is none. */
export function lockGameOf(lock: LockState): number | null {
  return lock.state === "none" ? null : lock.gameId;
}

/** The games that still count. The Void rule is applied here, not on the screens. */
export function liveGames<G extends GameView>(games: readonly G[]): G[] {
  return games.filter((g) => !isVoid(g));
}

/** The first live Game with no Pick: where "keep picking" sends the member. */
export function firstOpenGame<G extends GameView>(
  games: readonly G[],
  picked: (gameId: number) => boolean,
): G | undefined {
  return liveGames(games).find((g) => !picked(g.game.id));
}

/**
 * True once every live Game has a Pick: the Week's entry half is done, and what
 * is left — the Lock of the Week, the Tiebreaker Guess — is review's business.
 *
 * A wholly Void slate has nothing to pick and counts as complete.
 */
export function picksComplete(progress: SheetProgress): boolean {
  return progress.picksMade === progress.liveGames;
}

/**
 * The counts behind every "how much is left" line in the app.
 *
 * A Pick counts only once the server has it: `weekEntries` counts the rows the
 * database holds, and the pick flow reports only its saved local picks, so a
 * save still in flight — or one that failed — leaves its Game open on every
 * screen rather than on just the one that noticed.
 */
export function sheetProgress({
  games,
  picked,
  lock,
  tiebreakerGuess,
}: {
  games: readonly GameView[];
  picked: (gameId: number) => boolean;
  lock: LockState;
  tiebreakerGuess: number | null;
}): SheetProgress {
  const live = liveGames(games);
  const picksMade = live.filter((g) => picked(g.game.id)).length;
  const lockSet = lock.state === "counts";
  const guessSet = tiebreakerGuess !== null;
  // A Lock needs a live game to sit on, so a wholly voided slate leaves none to set.
  const lockOpen = live.length > 0 && !lockSet;
  return {
    liveGames: live.length,
    picksMade,
    lockSet,
    guessSet,
    lockOpen,
    remaining: (picksMade < live.length ? 1 : 0) + (lockOpen ? 1 : 0) + (guessSet ? 0 : 1),
  };
}

/** The one sentence for what is left, said the same way on `/week` and `/picks/review`. */
export function remainingLabel(progress: SheetProgress, weekNumber: number, locked: boolean): string {
  if (locked) return `Week ${weekNumber} is in the books`;
  if (progress.remaining === 0) return `You're all set for Week ${weekNumber}`;
  return `${plural(progress.remaining, "thing")} left before the deadline`;
}
