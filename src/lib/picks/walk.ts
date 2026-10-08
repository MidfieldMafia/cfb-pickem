/**
 * The walk: after the save that fills the sheet, the pick flow carries the
 * member through the Lock of the Week and the Tiebreaker Guess before Review,
 * covering only whichever is still missing (#381).
 *
 * It is set off by that save, not by the sheet's state, so nothing new is
 * stored: changing a pick on a full sheet never starts it, and a sheet with
 * holes goes on to Review as it always has. Kept free of database imports, like
 * `progress.ts`, so the client flow decides with the very same function.
 */
import type { SheetProgress } from "./progress";

/** A page the walk can show, in the order it shows them. */
export type WalkPage = "lock" | "guess";

/**
 * The pages a pick save walks through, or none. `before` is the sheet as it
 * stood when the tap landed; `savedGameWasOpen` says whether the game just
 * saved had no Pick until now. The walk starts only when that game was the
 * last one open.
 */
export function walkAfterSave(before: SheetProgress, savedGameWasOpen: boolean): WalkPage[] {
  if (!savedGameWasOpen || before.countingGames - before.picksMade !== 1) return [];
  const pages: WalkPage[] = [];
  if (before.lockOpen) pages.push("lock");
  if (!before.guessSet) pages.push("guess");
  return pages;
}

/** Where a walk page goes when it is saved or skipped: the walk's next page, else Review. */
export function pageAfter(walk: readonly WalkPage[], page: WalkPage): WalkPage | "review" {
  return walk[walk.indexOf(page) + 1] ?? "review";
}
