"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { conditionalGet, type ConditionalAnswer } from "./conditional";

/**
 * How long to wait before asking again, given what the phone now holds and
 * how long that has gone unchanged; null to stop asking. Read fresh on every
 * turn, so a cadence that closes over props sees their latest values.
 */
export type Cadence<T> = (held: T, quietForMs: number) => number | null;

export interface PollOptions<T> {
  /** What the phone holds before its first answer: the server render's copy, or null. */
  initial: T;
  cadence: Cadence<T>;
  /** Ask the moment polling starts, rather than one cadence after it. For a body the server render did not send. */
  askFirst?: boolean;
  /** Called on every refusal or dead connection. Polling carries on regardless; to stop, pass a null path. */
  onFailed?: (failure: Extract<ConditionalAnswer<T>, { kind: "failed" }>) => void;
}

export interface Poll<T> {
  held: T;
  /** The phone's own clock when the next ask is due, stamped as it is scheduled; null before the first or once stopped. */
  nextPollAt: number | null;
  /**
   * Holds a body that did not come from a poll — what a write answered, or a
   * change shown before the server has it — with its ETag, or null to have
   * the next poll answer in full. Counts as a change for the cadence.
   */
  hold: (next: T | ((current: T) => T), etag: string | null) => void;
}

/**
 * Keeps `path`'s answer fresh: asks again on the cadence of what it holds,
 * carrying the ETag so an unchanged answer is a 304 and no re-render. A
 * hidden tab does not ask, and asks the moment it is back. A failed ask leaves
 * the last body standing and tries again on the same cadence. A cadence of
 * null stops it for good, the tab coming back included; a null `path` stops
 * it until there is one, and a new path starts over without the old ETag.
 */
export function usePoll<T>(path: string | null, options: PollOptions<T>): Poll<T> {
  const [held, setHeld] = useState(options.initial);
  const [nextPollAt, setNextPollAt] = useState<number | null>(null);
  const etag = useRef<string | null>(null);
  /** The body as of the last answer or `hold`, for a turn that ends unchanged to time itself from. */
  const current = useRef(options.initial);
  const changedAt = useRef(0);
  const latest = useRef(options);

  useEffect(() => {
    latest.current = options;
  });

  useEffect(() => {
    changedAt.current = Date.now();
  }, []);

  useEffect(() => {
    if (path === null) return;
    etag.current = null;
    let cancelled = false;
    let stopped = false;
    /** One ask at a time: a tab coming back mid-ask would otherwise leave two timers running. */
    let asking = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      const delay = latest.current.cadence(current.current, Date.now() - changedAt.current);
      if (delay === null) {
        stopped = true;
        return;
      }
      setNextPollAt(Date.now() + delay);
      timer = setTimeout(() => void ask(), delay);
    };
    const ask = async () => {
      clearTimeout(timer);
      // A hidden tab does not ask; `visibilitychange` picks it up on return.
      if (document.visibilityState === "hidden" || asking) return;
      asking = true;
      const answer = await conditionalGet<T>(path, etag.current);
      asking = false;
      if (cancelled) return;
      if (answer.kind === "fresh") {
        etag.current = answer.etag;
        current.current = answer.body;
        changedAt.current = Date.now();
        setHeld(answer.body);
      }
      if (answer.kind === "failed") latest.current.onFailed?.(answer);
      schedule();
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible" || stopped) return;
      void ask();
    };

    document.addEventListener("visibilitychange", onVisibility);
    if (latest.current.askFirst) void ask();
    else schedule();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [path]);

  const hold = useCallback((next: T | ((current: T) => T), nextEtag: string | null) => {
    const value = typeof next === "function" ? (next as (current: T) => T)(current.current) : next;
    etag.current = nextEtag;
    current.current = value;
    changedAt.current = Date.now();
    setHeld(value);
  }, []);

  return { held, nextPollAt, hold };
}
