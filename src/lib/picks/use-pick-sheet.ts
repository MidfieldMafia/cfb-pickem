"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { PutResult } from "./client";
import { useDeadlineClock } from "./clock";
import type { SheetJson } from "./json";
import { sheetProgress } from "./progress";

/** What the screen has on show, and what the server last confirmed. They differ while a save is optimistic. */
interface Held {
  shown: SheetJson;
  held: SheetJson;
}

/**
 * How a successful save lands on the sheet. The default adopts the server's
 * answer whole; a screen that has several saves in flight at once passes a
 * merge instead, because answers can arrive out of order and an older one must
 * not roll back a newer pick.
 */
type Accept = (held: SheetJson, body: SheetJson) => SheetJson;

const adopt: Accept = (_held, body) => body;

/** The Deadline has passed for good: nothing on this sheet is editable any more. */
const lockedSheet = (sheet: SheetJson): SheetJson => (sheet.locked ? sheet : { ...sheet, locked: true });

/** Recounted from the sheet in hand: an optimistic change has to move these before the server answers. */
const progressOf = (sheet: SheetJson) =>
  sheetProgress({
    games: sheet.games,
    picked: (gameId) => sheet.picks.some((p) => p.gameId === gameId),
    lockGameId: sheet.lockGameId,
    lockDropped: sheet.lockDropped,
    tiebreakerGuess: sheet.tiebreakerGuess,
  });

/**
 * The pick sheet as a screen holds it, and the server-truth sequencing every
 * save has to repeat: the Deadline clock re-measured from each response, a 423
 * adopting the sheet it carries (or, with none, putting back what the server
 * last confirmed), and the layout's Picks-tab dot refreshed when the sheet
 * crosses "all set".
 *
 * `patch` is the optimistic write; `apply` settles it with the `put()` answer.
 * The screens keep only their own UI state around this.
 */
export function usePickSheet(initial: SheetJson) {
  const router = useRouter();
  const [state, setState] = useState<Held>({ shown: initial, held: initial });
  // Handlers read the latest state here, so an answer applied right after
  // another sees it, and `apply` can return what it just did.
  const latest = useRef(state);
  const commit = (next: Held) => {
    latest.current = next;
    setState(next);
  };

  const { remainingMs, passed, sync } = useDeadlineClock(state.shown.deadline, state.shown.serverNow);

  // The layout's dot reads what the server holds and a layout is not re-rendered
  // by client navigation, so refresh when the *confirmed* sheet crosses zero: an
  // optimistic Lock that may yet be refused must not count.
  const confirmedAllSet = progressOf(state.held).remaining === 0;
  const seenAllSet = useRef(confirmedAllSet);
  useEffect(() => {
    if (seenAllSet.current === confirmedAllSet) return;
    seenAllSet.current = confirmedAllSet;
    router.refresh();
  }, [confirmedAllSet, router]);

  /** An optimistic change: shown at once, and undone by `apply` if the server refuses it without an answer. */
  const patch = (change: (sheet: SheetJson) => SheetJson) =>
    commit({ ...latest.current, shown: change(latest.current.shown) });

  /**
   * Settle a `put()` answer and return the sheet now held.
   *
   * - Ok: `accept` puts the answer on the confirmed sheet.
   * - Refused with the server's sheet (a 423): that sheet is what counts, so it
   *   is adopted rather than a value the screen only remembered.
   * - Refused without one: the optimistic change is reverted.
   * A refusal for the Deadline also locks the sheet.
   */
  const apply = (result: PutResult<SheetJson>, accept: Accept = adopt): SheetJson => {
    const { held } = latest.current;
    let next: Held;
    if (result.ok) {
      sync(result.body.serverNow);
      const confirmed = accept(held, result.body);
      next = { shown: confirmed, held: confirmed };
    } else if (result.body) {
      sync(result.body.serverNow);
      next = { shown: result.body, held: result.body };
    } else {
      next = { shown: held, held };
    }
    if (!result.ok && result.locked) next = { shown: lockedSheet(next.shown), held: lockedSheet(next.held) };
    commit(next);
    return next.held;
  };

  /**
   * Take a fresher sheet the screen fetched itself. `keep` names what the member
   * has changed since, which stays as it is on screen; the confirmed sheet is the
   * server's whole answer.
   */
  const receive = (fresh: SheetJson, keep: (shown: SheetJson) => Partial<SheetJson> = () => ({})) => {
    sync(fresh.serverNow);
    commit({ shown: { ...fresh, ...keep(latest.current.shown) }, held: fresh });
  };

  const sheet = state.shown;
  const progress = progressOf(sheet);

  return { sheet, progress, locked: sheet.locked || passed, remainingMs, patch, apply, receive };
}
