import type { Stop, Tour, TourTarget } from "./tours";

/**
 * Where a running Tour is (#431, spec #426): the Stops still in it and which
 * one is on screen. A Stop whose target isn't there is dropped, not skipped
 * over, so "n of N" always counts what the member will actually see. Nothing
 * here touches the DOM; the runner finds targets and calls `drop`.
 */
export type Run = { stops: readonly Stop[]; at: number };

export function startRun(tour: Tour): Run {
  return { stops: tour.stops, at: 0 };
}

/** The Stop on screen, or nothing once the Tour has run out of Stops. */
export function current(run: Run): Stop | undefined {
  return run.stops[run.at];
}

export function next(run: Run): Run {
  return { ...run, at: run.at + 1 };
}

export function back(run: Run): Run {
  return { ...run, at: Math.max(0, run.at - 1) };
}

/** Takes the current Stop out; the one after it is current now. */
export function drop(run: Run): Run {
  return { stops: run.stops.filter((_, index) => index !== run.at), at: run.at };
}

/** "n of N", after dropped Stops. */
export function position(run: Run): { position: number; of: number } {
  return { position: run.at + 1, of: run.stops.length };
}

const TAB_HREFS: Partial<Record<TourTarget, string>> = {
  "tab-picks": "/picks",
  "tab-live": "/live",
  "tab-leaderboard": "/leaderboard",
  "tab-chat": "/chat",
};

/**
 * The tab a tap Stop's target opens, matched the way the nav marks a tab
 * active: the Picks tab covers `/picks/review` too.
 */
export function tabHref(target: TourTarget): string | undefined {
  return TAB_HREFS[target];
}

export function onTab(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The card's buttons, by the Stop's `kind`: a tap Stop has no Next (tapping
 * the tab is the only way on), a screen Stop has no Back (Back never crosses
 * tabs), and nothing goes Back onto a tap Stop, which would ask the member to
 * tap the tab they are already on. `last` makes Next read Done.
 */
export function controls(run: Run): { back: boolean; next: boolean; last: boolean } {
  const stop = current(run);
  const before = run.stops[run.at - 1];
  return {
    back: stop?.kind !== "screen" && before !== undefined && before.kind !== "tap",
    next: stop?.kind !== "tap",
    last: run.at === run.stops.length - 1,
  };
}
