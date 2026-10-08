// @vitest-environment jsdom
/**
 * Review on a wholly Void slate (#411). Its steps are a Pick per counting
 * game, the Lock of the Week, and the Tiebreaker Guess, but such a slate has
 * nothing to pick and nowhere to put a Lock. Counting or offering either left
 * the member a step they could never finish, so the badge, the step rows, the
 * Lock card and the picks bar all have to agree that only the Guess is left.
 *
 * The arrival refetch is held open, so the screen shows the sheet it was given.
 * Plain DOM reads, as in `pick-flow.test.tsx`: `jest-dom` is not a dependency.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MIAMI, MICHIGAN, TEXAS, VOIDED, sheet } from "@/test/sheet";
import { Review } from "./review";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

beforeEach(() => vi.stubGlobal("fetch", () => new Promise(() => {})));
// `cleanup` by hand, as in `pick-flow.test.tsx`: this suite imports its hooks.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ALL_VOID = [MIAMI, MICHIGAN, TEXAS].map((view) => ({ ...view, result: VOIDED }));

/** Anything on screen that offers the Lock: its step row or its summary card. */
const lockOffers = () => screen.queryAllByText(/Lock of the Week|Choose your Lock/);
const picksRow = () => screen.getByRole("button", { name: /Make every pick/ });
/** How full the picks bar is, read from its indicator's offset. */
const barFill = () =>
  document.querySelector<HTMLElement>('[data-slot="progress-indicator"]')?.style.transform;

describe("a slate with games to pick", () => {
  test("counts a Pick per game, the Lock and the Guess, and offers the Lock", () => {
    render(<Review initial={sheet()} />);

    expect(screen.getByText("0 of 5")).toBeTruthy();
    expect(lockOffers().length).toBeGreaterThan(0);
    expect(barFill()).toBe("translateX(-100%)");
  });
});

describe("a wholly Void slate", () => {
  test("leaves the Picks and the Lock out of the count", () => {
    render(<Review initial={sheet({ games: ALL_VOID })} />);

    expect(screen.getByText("0 of 1")).toBeTruthy();
  });

  test("reaches done once the Guess is in", () => {
    render(<Review initial={sheet({ games: ALL_VOID, tiebreakerGuess: 52 })} />);

    expect(screen.getByText("1 of 1")).toBeTruthy();
  });

  test("offers no Lock, not even to move a Dropped one", () => {
    render(<Review initial={sheet({ games: ALL_VOID, lock: { state: "dropped", gameId: MIAMI.game.id } })} />);

    expect(lockOffers()).toEqual([]);
  });

  test("shows the picks as done, with nothing to open", () => {
    render(<Review initial={sheet({ games: ALL_VOID })} />);

    expect(barFill()).toBe("translateX(-0%)");
    expect(picksRow().textContent).toContain("Every game is void");
    expect(picksRow().hasAttribute("disabled")).toBe(true);
  });
});
