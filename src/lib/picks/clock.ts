"use client";

import { useState, useSyncExternalStore } from "react";

const subscribeEverySecond = (onTick: () => void) => {
  const timer = setInterval(onTick, 1000);
  return () => clearInterval(timer);
};

/**
 * A countdown driven by the server clock. The offset between the server's
 * `serverNow` and the phone's clock is measured when the sheet arrives, so a
 * phone with a wrong clock still counts down to the real Deadline. Call
 * `sync` with a fresher `serverNow` from an API response to re-measure.
 */
export function useDeadlineClock(deadline: string, serverNow: string) {
  const [offset, setOffset] = useState(() => new Date(serverNow).getTime() - Date.now());
  // Whole seconds so the snapshot is stable between ticks; the server renders from its own clock.
  const nowSeconds = useSyncExternalStore(
    subscribeEverySecond,
    () => Math.floor(Date.now() / 1000),
    () => Math.floor(new Date(serverNow).getTime() / 1000),
  );
  const remainingMs = new Date(deadline).getTime() - (nowSeconds * 1000 + offset);
  const sync = (freshServerNow: string) => setOffset(new Date(freshServerNow).getTime() - Date.now());
  return { remainingMs, passed: remainingMs <= 0, sync };
}

/** "1d 06h 40m 08s", "06h 40m 08s" inside a day, "00h 00m 00s" once passed. */
export function formatCountdown(remainingMs: number): string {
  const s = Math.max(0, Math.floor(remainingMs / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  const days = Math.floor(s / 86400);
  const rest = `${pad(Math.floor(s / 3600) % 24)}h ${pad(Math.floor(s / 60) % 60)}m ${pad(s % 60)}s`;
  return days > 0 ? `${days}d ${rest}` : rest;
}
