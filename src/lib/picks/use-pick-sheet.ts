"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { put } from "./client";
import { useDeadlineClock } from "./clock";
import type { SheetJson } from "./json";
import { lockOn, sheetProgress, type LockState } from "./progress";

/**
 * Where one save stands. `value` is what the member asked for, so a screen can
 * show it while it is in flight and offer it again when it failed.
 */
export type SaveStatus<V> =
  | { state: "idle" }
  | { state: "saving"; value: V }
  | { state: "saved"; value: V }
  | { state: "failed"; value: V; error: string };

/** How one save ended, for a screen that moves on or reports afterwards. */
export type SaveOutcome =
  | { state: "saved" }
  | { state: "failed"; error: string; /** The Deadline passed under it. */ locked: boolean }
  /** A newer save of the same thing was made before this one was answered; its answer was dropped. */
  | { state: "superseded" };

/** One game's Pick as the pick flow shows it: the server's, or a save it has not taken yet. */
export interface ShownPick {
  teamId: number;
  state: "saved" | "saving" | "failed";
  error?: string;
}

interface State {
  /** What the server last confirmed, field by field. */
  held: SheetJson;
  /** Pick saves the server has not taken: in flight, or refused. */
  picks: Record<number, SaveStatus<number> | undefined>;
  lock: SaveStatus<LockState>;
  guess: SaveStatus<number>;
}

const IDLE = { state: "idle" } as const;

/** The Deadline has passed for good: nothing on this sheet is editable any more. */
const lockedSheet = (sheet: SheetJson): SheetJson => (sheet.locked ? sheet : { ...sheet, locked: true });

/** What the member sees: the confirmed sheet, with a Lock still in flight shown as chosen. */
const shownSheet = ({ held, lock }: State): SheetJson =>
  lock.state === "saving" ? { ...held, lock: lock.value } : held;

/**
 * Recounted from a sheet in hand. Picks count only once the server has them; a
 * Lock in flight counts, because the member chose it and a refusal puts it back.
 */
const progressOf = (sheet: SheetJson) =>
  sheetProgress({
    games: sheet.games,
    picked: (gameId) => sheet.picks.some((p) => p.gameId === gameId),
    lock: sheet.lock,
    tiebreakerGuess: sheet.tiebreakerGuess,
  });

/** One kind of save: where it goes, and which of the answer's fields it takes onto the confirmed sheet. */
interface Save<V> {
  key: string;
  path: string;
  body: unknown;
  value: V;
  /**
   * Only the saved field comes off the answer. Saves of different things are
   * answered in any order, and an older answer adopted whole would roll back a
   * newer one's field.
   */
  take: (held: SheetJson, answer: SheetJson) => SheetJson;
  mark: (state: State, status: SaveStatus<V>) => State;
}

/**
 * The pick sheet as a screen holds it, and every save the screens make. A
 * screen calls `savePick`, `setLock` or `setGuess` and renders what comes
 * back; behind them sit the endpoints, the optimistic update (the Lock's
 * state included), dropping an answer a newer save has superseded, taking
 * each answer's own field so replies can arrive out of order, adopting the
 * server's sheet on a 423, and merging a refetch. The layout's Picks-tab dot
 * is refreshed when the confirmed sheet crosses "all set".
 *
 * `refetch` re-reads the sheet once on arrival, so the countdown starts from a
 * fresh server clock; whatever the member has saved here since stays.
 */
export function usePickSheet(initial: SheetJson, { refetch = false }: { refetch?: boolean } = {}) {
  const router = useRouter();
  const [state, setState] = useState<State>({ held: initial, picks: {}, lock: IDLE, guess: IDLE });
  // Handlers read the latest state here, so an answer applied right after
  // another sees it rather than the render it was created in.
  const latest = useRef(state);
  const commit = (next: State) => {
    latest.current = next;
    setState(next);
  };
  const attempts = useRef(new Map<string, number>());
  // What this screen has saved, which a refetch that raced it must not undo.
  const touched = useRef(new Set<string>());
  const [lateError, setLateError] = useState<string | null>(null);

  const { remainingMs, passed, sync } = useDeadlineClock(state.held.deadline, state.held.serverNow);

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

  useEffect(() => {
    if (!refetch) return;
    let stale = false;
    fetch("/api/week/picks", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<SheetJson>) : null))
      .then((fresh) => {
        if (!fresh || stale) return;
        sync(fresh.serverNow);
        const { held } = latest.current;
        const saved = touched.current;
        commit({
          ...latest.current,
          held: {
            ...fresh,
            picks: [
              ...fresh.picks.filter((p) => !saved.has(pickKey(p.gameId))),
              ...held.picks.filter((p) => saved.has(pickKey(p.gameId))),
            ],
            ...(saved.has("lock") && { lock: held.lock }),
            ...(saved.has("guess") && { tiebreakerGuess: held.tiebreakerGuess }),
          },
        });
      })
      .catch(() => {
        // The server-rendered sheet stands until the network is back.
      });
    return () => {
      stale = true;
    };
    // Runs once on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send<V>({ key, path, body, value, take, mark }: Save<V>): Promise<SaveOutcome> {
    const attempt = (attempts.current.get(key) ?? 0) + 1;
    attempts.current.set(key, attempt);
    commit(mark(latest.current, { state: "saving", value }));

    const result = await put<SheetJson>(path, body);
    if (attempts.current.get(key) !== attempt) return { state: "superseded" };
    touched.current.add(key);

    let { held } = latest.current;
    if (result.ok) {
      sync(result.body.serverNow);
      held = take(held, result.body);
    } else if (result.body) {
      // A 423 carries what the server holds as the Deadline passed: that is what counts.
      sync(result.body.serverNow);
      held = result.body;
    }
    if (!result.ok && result.locked) {
      held = lockedSheet(held);
      setLateError(result.error);
    }
    const status: SaveStatus<V> = result.ok
      ? { state: "saved", value }
      : { state: "failed", value, error: result.error };
    commit(mark({ ...latest.current, held }, status));
    return result.ok ? { state: "saved" } : { state: "failed", error: result.error, locked: result.locked };
  }

  const savePick = (gameId: number, teamId: number) =>
    send({
      key: pickKey(gameId),
      path: "/api/week/picks",
      body: { gameId, teamId },
      value: teamId,
      take: (held, answer) => ({
        ...held,
        serverNow: answer.serverNow,
        picks: [...held.picks.filter((p) => p.gameId !== gameId), { gameId, teamId, updatedAt: answer.serverNow }],
      }),
      // A settled save leaves the overlay: the sheet shows it now. A failure
      // stays, to be retried — unless the Deadline refused it, and then there
      // is nothing to retry and the sheet shows what the server holds.
      mark: (s, status) => {
        const pending = status.state === "saving" || (status.state === "failed" && !s.held.locked);
        return { ...s, picks: { ...s.picks, [gameId]: pending ? status : undefined } };
      },
    });

  const setLock = (gameId: number | null) =>
    send({
      key: "lock",
      path: "/api/week/lock",
      body: { gameId },
      // Its state is read off the slate, so moving a Dropped Lock shows a Lock that counts.
      value: lockOn(latest.current.held.games, gameId),
      take: (held, answer) => ({ ...held, serverNow: answer.serverNow, lock: answer.lock }),
      mark: (s, status) => ({ ...s, lock: status }),
    });

  const setGuess = (guess: number) =>
    send({
      key: "guess",
      path: "/api/week/tiebreaker",
      body: { guess },
      value: guess,
      // The stored Guess as the server has it, rather than the value sent to it.
      take: (held, answer) => ({ ...held, serverNow: answer.serverNow, tiebreakerGuess: answer.tiebreakerGuess }),
      mark: (s, status) => ({ ...s, guess: status }),
    });

  /** One game's Pick as shown: a save in flight or refused, else the server's. */
  const pick = (gameId: number): ShownPick | undefined => {
    const pending = state.picks[gameId];
    if (pending && pending.state !== "idle") {
      return pending.state === "failed"
        ? { teamId: pending.value, state: "failed", error: pending.error }
        : { teamId: pending.value, state: pending.state };
    }
    const held = state.held.picks.find((p) => p.gameId === gameId);
    return held ? { teamId: held.teamId, state: "saved" } : undefined;
  };

  const sheet = shownSheet(state);

  return {
    sheet,
    progress: progressOf(sheet),
    locked: sheet.locked || passed,
    remainingMs,
    /** The message of a save the Deadline refused, once one has been. */
    lateError,
    pick,
    status: { lock: state.lock, guess: state.guess },
    savePick,
    setLock,
    setGuess,
  };
}

const pickKey = (gameId: number) => `pick:${gameId}`;
