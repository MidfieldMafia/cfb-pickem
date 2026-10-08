// @vitest-environment jsdom
/**
 * Review's step count, the "x of y" badge in its header. A Pick per counting
 * game, the Lock of the Week, and the Tiebreaker Guess are the steps, except
 * that a wholly Void slate has nowhere to put a Lock: counting a Lock step
 * there left the member a step they could never finish (#411).
 *
 * The arrival refetch is held open, so the screen shows the sheet it was given.
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

describe("the step count", () => {
  test("counts a Pick per game, the Lock and the Guess", () => {
    render(<Review initial={sheet()} />);

    expect(screen.getByText("0 of 5")).toBeTruthy();
  });

  test("leaves the Lock out when every game is Void", () => {
    render(<Review initial={sheet({ games: ALL_VOID })} />);

    expect(screen.getByText("0 of 1")).toBeTruthy();
  });

  test("reaches done on a wholly Void slate once the Guess is in", () => {
    render(<Review initial={sheet({ games: ALL_VOID, tiebreakerGuess: 52 })} />);

    expect(screen.getByText("1 of 1")).toBeTruthy();
  });
});
