// @vitest-environment jsdom
/**
 * The save hook at its interface: a screen calls `savePick`, `setLock` or
 * `setGuess` and renders what the hook holds. The seam is `fetch`, faked so a
 * test decides when each request is answered and in what order — which is the
 * part of saving the two screens used to get wrong on their own.
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MIAMI, MICHIGAN, SERVER_NOW, TEXAS, VOIDED, sheet } from "@/test/sheet";
import type { SheetJson } from "./json";
import { usePickSheet } from "./use-pick-sheet";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

interface Call {
  path: string;
  method: string;
  body: unknown;
  answer: (response: Response) => Promise<void>;
}

/**
 * A `fetch` that holds every request until the test answers it. `answer`
 * resolves once the hook has had the chance to act on the reply.
 */
function fakeFetch() {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", (path: string, init: RequestInit = {}) => {
    let resolve!: (response: Response) => void;
    const reply = new Promise<Response>((r) => (resolve = r));
    calls.push({
      path,
      method: init.method ?? "GET",
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      answer: async (response) => {
        await act(async () => {
          resolve(response);
          await reply;
        });
      },
    });
    return reply;
  });
  return calls;
}

const pick = (view: typeof MIAMI, teamId = view.game.homeTeamId) => ({ gameId: view.game.id, teamId, updatedAt: SERVER_NOW });
const counts = (view: typeof MIAMI) => ({ state: "counts" as const, gameId: view.game.id });
const locked423 = (body?: SheetJson) =>
  Response.json({ error: "Picks are locked: the deadline has passed.", locked: true, sheet: body }, { status: 423 });

let calls: Call[];
beforeEach(() => {
  refresh.mockClear();
  calls = fakeFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("saving a Pick", () => {
  test("shows the team at once, counts it only once the server has it, and says how the save went", async () => {
    const { result } = renderHook(() => usePickSheet(sheet()));

    act(() => void result.current.savePick(MIAMI.game.id, MIAMI.game.awayTeamId));
    expect(calls.map((c) => [c.method, c.path, c.body])).toEqual([
      ["PUT", "/api/week/picks", { gameId: MIAMI.game.id, teamId: MIAMI.game.awayTeamId }],
    ]);
    expect(result.current.pick(MIAMI.game.id)).toEqual({ teamId: MIAMI.game.awayTeamId, state: "saving" });
    expect(result.current.progress.picksMade).toBe(0);

    await calls[0].answer(Response.json(sheet({ picks: [pick(MIAMI, MIAMI.game.awayTeamId)] })));
    expect(result.current.pick(MIAMI.game.id)).toEqual({ teamId: MIAMI.game.awayTeamId, state: "saved" });
    expect(result.current.progress.picksMade).toBe(1);
  });

  test("replies that arrive out of order keep both Picks, and a superseded reply is dropped", async () => {
    const { result } = renderHook(() => usePickSheet(sheet()));
    const outcomes: unknown[] = [];

    act(() => void result.current.savePick(MIAMI.game.id, MIAMI.game.homeTeamId));
    act(() => void result.current.savePick(TEXAS.game.id, TEXAS.game.awayTeamId));
    // The Texas reply comes first, and is a sheet from before the Miami save landed.
    await calls[1].answer(Response.json(sheet({ picks: [pick(TEXAS, TEXAS.game.awayTeamId)] })));
    await calls[0].answer(Response.json(sheet({ picks: [pick(MIAMI)] })));
    expect(result.current.sheet.picks.map((p) => [p.gameId, p.teamId]).sort()).toEqual(
      [
        [MIAMI.game.id, MIAMI.game.homeTeamId],
        [TEXAS.game.id, TEXAS.game.awayTeamId],
      ].sort(),
    );

    // Two taps on one game: the first tap's reply, arriving last, must not win.
    act(() => void result.current.savePick(MICHIGAN.game.id, MICHIGAN.game.awayTeamId).then((o) => outcomes.push(o)));
    act(() => void result.current.savePick(MICHIGAN.game.id, MICHIGAN.game.homeTeamId).then((o) => outcomes.push(o)));
    await calls[3].answer(Response.json(sheet()));
    await calls[2].answer(Response.json(sheet()));
    expect(result.current.pick(MICHIGAN.game.id)).toEqual({ teamId: MICHIGAN.game.homeTeamId, state: "saved" });
    expect(outcomes).toEqual([{ state: "saved" }, { state: "superseded" }]);
  });

  test("a failure keeps the team to retry and leaves the game open", async () => {
    const { result } = renderHook(() => usePickSheet(sheet()));

    let outcome: unknown;
    act(() => void result.current.savePick(TEXAS.game.id, TEXAS.game.homeTeamId).then((o) => (outcome = o)));
    await calls[0].answer(Response.json({ error: "That didn't save. Try again." }, { status: 500 }));

    expect(outcome).toEqual({ state: "failed", error: "That didn't save. Try again.", locked: false });
    expect(result.current.pick(TEXAS.game.id)).toEqual({
      teamId: TEXAS.game.homeTeamId,
      state: "failed",
      error: "That didn't save. Try again.",
    });
    expect(result.current.progress.picksMade).toBe(0);
    expect(result.current.locked).toBe(false);
  });
});

describe("a 423", () => {
  test("with a sheet adopts what the server holds and locks", async () => {
    const { result } = renderHook(() => usePickSheet(sheet({ picks: [pick(MIAMI)] })));
    // The server took a different pick before the Deadline than the one we tried.
    const server = sheet({ picks: [pick(MIAMI, MIAMI.game.awayTeamId)], serverNow: "2026-09-11T00:00:01.000Z" });

    act(() => void result.current.savePick(MIAMI.game.id, MIAMI.game.homeTeamId));
    await calls[0].answer(locked423(server));

    expect(result.current.sheet.picks).toEqual(server.picks);
    expect(result.current.pick(MIAMI.game.id)).toEqual({ teamId: MIAMI.game.awayTeamId, state: "saved" });
    expect(result.current.locked).toBe(true);
    expect(result.current.lateError).toMatch(/deadline has passed/);
  });

  test("without a sheet puts back the optimistic Lock and locks", async () => {
    const { result } = renderHook(() =>
      usePickSheet(sheet({ picks: [pick(MIAMI), pick(TEXAS)], lock: counts(MIAMI) })),
    );

    act(() => void result.current.setLock(TEXAS.game.id));
    expect(result.current.sheet.lock).toEqual(counts(TEXAS));
    await calls[0].answer(locked423());

    expect(result.current.sheet.lock).toEqual(counts(MIAMI));
    expect(result.current.locked).toBe(true);
  });
});

describe("setting the Lock", () => {
  test("moving a Dropped Lock counts the new one at once, not as dropped", async () => {
    const voidMiami = { ...MIAMI, result: VOIDED };
    const start = sheet({
      games: [voidMiami, MICHIGAN, TEXAS],
      picks: [pick(MIAMI), pick(MICHIGAN), pick(TEXAS)],
      lock: { state: "dropped", gameId: MIAMI.game.id },
      tiebreakerGuess: 50,
    });
    const { result } = renderHook(() => usePickSheet(start));
    expect(result.current.progress.lockSet).toBe(false);

    act(() => void result.current.setLock(MICHIGAN.game.id));

    expect(result.current.sheet.lock).toEqual(counts(MICHIGAN));
    expect(result.current.progress).toMatchObject({ lockSet: true, remaining: 0 });
    expect(result.current.status.lock).toEqual({ state: "saving", value: counts(MICHIGAN) });
  });

  test("a refusal puts it back and says why", async () => {
    const { result } = renderHook(() => usePickSheet(sheet({ picks: [pick(MICHIGAN)] })));

    act(() => void result.current.setLock(MICHIGAN.game.id));
    await calls[0].answer(Response.json({ error: "No." }, { status: 400 }));

    expect(result.current.sheet.lock).toEqual({ state: "none" });
    expect(result.current.status.lock).toMatchObject({ state: "failed", error: "No." });
    expect(result.current.locked).toBe(false);
  });
});

test("the Guess is the server's stored value once it answers", async () => {
  const { result } = renderHook(() => usePickSheet(sheet()));

  act(() => void result.current.setGuess(52));
  expect(calls[0].body).toEqual({ guess: 52 });
  expect(result.current.status.guess).toEqual({ state: "saving", value: 52 });
  await calls[0].answer(Response.json(sheet({ tiebreakerGuess: 52 })));

  expect(result.current.sheet.tiebreakerGuess).toBe(52);
  expect(result.current.status.guess).toEqual({ state: "saved", value: 52 });
});

test("a refetch on arrival takes the server's sheet but keeps what was saved here since", async () => {
  const { result } = renderHook(() =>
    usePickSheet(sheet({ picks: [pick(MIAMI), pick(TEXAS)] }), { refetch: true }),
  );
  expect(calls[0]).toMatchObject({ method: "GET", path: "/api/week/picks" });

  act(() => void result.current.setLock(TEXAS.game.id));
  await calls[1].answer(Response.json(sheet({ picks: [pick(MIAMI), pick(TEXAS)], lock: counts(TEXAS) })));
  // The refetch left before the Lock was saved, and has a Pick from another tab.
  await calls[0].answer(
    Response.json(sheet({ picks: [pick(MIAMI), pick(MICHIGAN), pick(TEXAS)], serverNow: "2026-09-10T22:00:30.000Z" })),
  );

  expect(result.current.sheet.lock).toEqual(counts(TEXAS));
  expect(result.current.sheet.picks.map((p) => p.gameId).sort()).toEqual([MIAMI, MICHIGAN, TEXAS].map((v) => v.game.id).sort());
});

describe("the layout refresh", () => {
  const nearlyDone = () => sheet({ picks: [pick(MIAMI), pick(MICHIGAN), pick(TEXAS)], tiebreakerGuess: 50 });

  test("fires when a confirmed answer completes the sheet", async () => {
    const { result } = renderHook(() => usePickSheet(nearlyDone()));

    act(() => void result.current.setLock(MIAMI.game.id));
    expect(refresh).not.toHaveBeenCalled();
    await calls[0].answer(Response.json(sheet({ ...nearlyDone(), lock: counts(MIAMI) })));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  test("does not fire for an optimistic change the server refuses", async () => {
    const { result } = renderHook(() => usePickSheet(nearlyDone()));

    act(() => void result.current.setLock(MIAMI.game.id));
    expect(result.current.progress.remaining).toBe(0);
    await calls[0].answer(Response.json({ error: "No." }, { status: 400 }));

    expect(refresh).not.toHaveBeenCalled();
  });
});
