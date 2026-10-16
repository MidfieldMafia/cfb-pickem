/**
 * The Welcome Tour's Stop rules (#431, spec #426): which Stop comes next,
 * what "n of N" says once Stops are dropped, and which controls a Stop's card
 * shows. The DOM side — finding targets, waiting for them — is the runner's.
 */
import { describe, expect, test } from "vitest";
import { back, controls, current, drop, next, position, startRun } from "./run";
import { tours } from "./tours";

const welcome = tours.welcome;
const ids = (run: ReturnType<typeof startRun>) => run.stops.map((stop) => stop.id);

describe("the Stop order", () => {
  test("starts at Stop 1 with all ten Stops", () => {
    const run = startRun(welcome);
    expect(current(run)?.id).toBe("tab-picks");
    expect(position(run)).toEqual({ position: 1, of: 10 });
  });

  test("Next walks the registry in order", () => {
    let run = startRun(welcome);
    const seen: string[] = [];
    while (current(run)) {
      seen.push(current(run)!.id);
      run = next(run);
    }
    expect(seen).toEqual(welcome.stops.map((stop) => stop.id));
  });

  test("Back steps one Stop back, and not before Stop 1", () => {
    const run = next(next(startRun(welcome)));
    expect(current(back(run))?.id).toBe("picks-screen");
    expect(current(back(startRun(welcome)))?.id).toBe("tab-picks");
  });
});

describe("dropping a Stop", () => {
  test("recounts n of N and moves on to the Stop after it", () => {
    const run = drop(next(startRun(welcome)));
    expect(current(run)?.id).toBe("tab-live");
    expect(position(run)).toEqual({ position: 2, of: 9 });
    expect(ids(run)).not.toContain("picks-screen");
  });

  test("dropping the last Stop leaves nothing, so the Tour ends", () => {
    let run = startRun(welcome);
    while (current(run)?.id !== "rules") run = next(run);
    expect(current(drop(run))).toBeUndefined();
  });
});

describe("the card's controls", () => {
  const at = (id: string) => {
    let run = startRun(welcome);
    while (current(run)?.id !== id) run = next(run);
    return run;
  };

  test("a tap Stop has no Next, and Stop 1 has no Back", () => {
    expect(controls(at("tab-picks"))).toEqual({ back: false, next: false, last: false });
  });

  test("a later tap Stop has Back", () => {
    expect(controls(at("tab-live"))).toEqual({ back: true, next: false, last: false });
  });

  test("a screen Stop has Next and no Back", () => {
    expect(controls(at("live-screen"))).toEqual({ back: false, next: true, last: false });
  });

  test("a point Stop has both, and the last one reads as Done", () => {
    expect(controls(at("pennant"))).toEqual({ back: true, next: true, last: false });
    expect(controls(at("rules"))).toEqual({ back: true, next: true, last: true });
  });

  test("no Back onto a tap Stop, which would ask for the tab the member is on", () => {
    // With the Live Board's screen Stop dropped, the Stop before Leaderboard's
    // tap Stop is Live Board's: going back to it would say "Tap Live Board"
    // on the Live Board.
    let run = at("live-screen");
    run = drop(run);
    expect(current(run)?.id).toBe("tab-leaderboard");
    expect(controls(run).back).toBe(false);
  });
});
