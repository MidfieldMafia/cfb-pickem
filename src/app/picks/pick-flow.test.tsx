// @vitest-environment jsdom
/**
 * The first component test in the repo, and the smallest cut that proves the
 * tooling: jsdom and Testing Library were already installed and already used
 * by `picks/clock.test.ts`, and `vitest.config.mts` only had to collect
 * `.tsx` as well as `.ts`.
 *
 * What it covers is the reconciliation `put()` feeds and nothing beneath it.
 * The seam is `fetch`, stubbed the way `picks/client.test.ts` stubs it, so no
 * production code needed a second adapter to make any of this reachable. The
 * behaviours are #73's: a 423 arriving under a tap, and what happens to a
 * pick the server had already taken.
 *
 * Assertions are plain DOM reads on purpose — `@testing-library/jest-dom` is
 * not a dependency here, and `toHaveAttribute` inside a `waitFor` fails as an
 * invalid Chai property that the retry loop hides until it times out.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MICHIGAN, TEXAS, sheet } from "@/test/sheet";
import { PickFlow } from "./pick-flow";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

/** Answers each tap in turn, holding the last answer for any tap after them. */
function answering(...responses: Response[]) {
  const sent: unknown[] = [];
  let call = 0;
  vi.stubGlobal("fetch", async (_path: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    return responses[Math.min(call++, responses.length - 1)];
  });
  return sent;
}

const ok = () => Response.json({ serverNow: "2026-09-10T22:00:05.000Z" });

const lockedOut = () =>
  Response.json({ error: "Picks are locked: the deadline has passed.", locked: true }, { status: 423 });

beforeEach(() => push.mockClear());
/**
 * `cleanup` by hand: Testing Library registers its own only when Vitest runs
 * with `globals: true`, and this suite imports its hooks explicitly like every
 * other one here. Without it each render stacks up in the same document and
 * the next test finds two of every tile.
 */
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The tile for a team is a button carrying its name. */
const tile = (name: string) => screen.getByRole("button", { name });
const pressed = (name: string) => tile(name).getAttribute("aria-pressed");

describe("a tap on a team", () => {
  /**
   * Opened on the last game, so the advance that follows a save lands on the
   * review screen rather than swapping the tiles out from under the assertion.
   */
  test("saves the pick, marks the tile, and moves on when the slate is done", async () => {
    const sent = answering(ok());
    render(<PickFlow sheet={sheet()} startGameId={TEXAS.game.id} />);

    tile("Texas").click();

    await waitFor(() => expect(pressed("Texas")).toBe("true"));
    expect(sent).toEqual([{ gameId: TEXAS.game.id, teamId: TEXAS.game.homeTeamId }]);
    expect(pressed("Ohio State")).toBe("false");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/picks/review"));
  });

  /**
   * The 423 revert. The Deadline passed between the tap and the answer, so
   * the screen drops the optimistic pick and paints locked — a member who
   * never had a pick on this game must not be left looking at one.
   */
  test("a 423 under the tap reverts the pick and locks the screen", async () => {
    const sent = answering(lockedOut());
    render(<PickFlow sheet={sheet()} startGameId={MICHIGAN.game.id} />);

    tile("Michigan").click();

    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Picks are locked/));
    expect(pressed("Michigan")).toBe("false");
    expect(screen.getByText(/the deadline has passed/)).toBeTruthy();

    // Locked means locked: the tiles are disabled and a second tap sends nothing.
    expect(tile("Michigan").hasAttribute("disabled")).toBe(true);
    tile("Michigan").click();
    expect(sent).toHaveLength(1);
  });

  test("a 423 leaves a pick the server had already taken standing", async () => {
    answering(lockedOut());
    render(
      <PickFlow
        sheet={sheet({
          picks: [{ gameId: MICHIGAN.game.id, teamId: MICHIGAN.game.awayTeamId, updatedAt: "" }],
        })}
        startGameId={MICHIGAN.game.id}
      />,
    );

    // Try to switch to the home team after the Deadline has quietly passed.
    tile("Michigan").click();

    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Picks are locked/));
    expect(pressed("Oklahoma")).toBe("true");
    expect(pressed("Michigan")).toBe("false");
  });

  test("a plain failure keeps its message on the game rather than advancing", async () => {
    answering(Response.json({ error: "That didn't save. Try again." }, { status: 500 }));
    render(<PickFlow sheet={sheet()} startGameId={TEXAS.game.id} />);

    tile("Texas").click();

    await waitFor(() => expect(screen.getByText(/Try again/)).toBeTruthy());
    expect(push).not.toHaveBeenCalled();
    // Not locked: the member can retry.
    expect(tile("Texas").hasAttribute("disabled")).toBe(false);
  });
});
