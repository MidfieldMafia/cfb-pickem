// @vitest-environment jsdom
/**
 * The sequencing every save repeats, below the two screens that used to carry
 * a copy each: what a 423 does with and without the server's sheet, what a
 * refused optimistic change puts back, and when the layout is told to refresh.
 * The answers are built as `PutResult`s directly; `put()` has its own suite.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MIAMI, MICHIGAN, SERVER_NOW, TEXAS, sheet } from "@/test/sheet";
import type { PutResult } from "./client";
import type { SheetJson } from "./json";
import { usePickSheet } from "./use-pick-sheet";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => refresh.mockClear());
afterEach(cleanup);

const pick = (view: typeof MIAMI, teamId = view.game.homeTeamId) => ({
  gameId: view.game.id,
  teamId,
  updatedAt: SERVER_NOW,
});
const ok = (body: SheetJson): PutResult<SheetJson> => ({ ok: true, body });
const refused = (over: Partial<Extract<PutResult<SheetJson>, { ok: false }>> = {}): PutResult<SheetJson> => ({
  ok: false,
  error: "No.",
  locked: false,
  ...over,
});

describe("a 423", () => {
  test("with a sheet adopts what the server holds and locks", () => {
    const { result } = renderHook(() => usePickSheet(sheet({ picks: [pick(MIAMI)] })));
    // The server took a different pick before the Deadline than the one we tried.
    const server = sheet({ picks: [pick(MIAMI, MIAMI.game.awayTeamId)], serverNow: "2026-09-11T00:00:01.000Z" });

    act(() => {
      result.current.apply(refused({ locked: true, body: server }));
    });

    expect(result.current.sheet.picks).toEqual(server.picks);
    expect(result.current.locked).toBe(true);
  });

  test("without a sheet locks and puts back the optimistic change", () => {
    const { result } = renderHook(() => usePickSheet(sheet({ lockGameId: MIAMI.game.id })));

    act(() => result.current.patch((s) => ({ ...s, lockGameId: TEXAS.game.id })));
    expect(result.current.sheet.lockGameId).toBe(TEXAS.game.id);
    act(() => {
      result.current.apply(refused({ locked: true }));
    });

    expect(result.current.sheet.lockGameId).toBe(MIAMI.game.id);
    expect(result.current.locked).toBe(true);
  });
});

test("a failed save puts back the optimistic change and leaves the sheet open", () => {
  const { result } = renderHook(() => usePickSheet(sheet()));

  act(() => result.current.patch((s) => ({ ...s, lockGameId: MICHIGAN.game.id })));
  act(() => {
    result.current.apply(refused());
  });

  expect(result.current.sheet.lockGameId).toBeNull();
  expect(result.current.locked).toBe(false);
});

test("a success adopts the answer, or whatever the screen's merge makes of it", () => {
  const { result } = renderHook(() => usePickSheet(sheet()));

  act(() => {
    result.current.apply(ok(sheet({ lockGameId: TEXAS.game.id })));
  });
  expect(result.current.sheet.lockGameId).toBe(TEXAS.game.id);

  let held: SheetJson | undefined;
  act(() => {
    held = result.current.apply(ok(sheet()), (h) => ({ ...h, picks: [pick(MIAMI)] }));
  });
  expect(result.current.sheet.picks).toHaveLength(1);
  expect(held?.picks).toHaveLength(1);
});

describe("the layout refresh", () => {
  const nearlyDone = () =>
    sheet({
      picks: [pick(MIAMI), pick(MICHIGAN), pick(TEXAS)],
      lockGameId: null,
      tiebreakerGuess: 50,
    });

  test("fires when a confirmed answer completes the sheet", () => {
    const { result } = renderHook(() => usePickSheet(nearlyDone()));
    expect(refresh).not.toHaveBeenCalled();

    act(() => {
      result.current.apply(ok(sheet({ ...nearlyDone(), lockGameId: MIAMI.game.id })));
    });

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test("does not fire for an optimistic change the server has not confirmed", () => {
    const { result } = renderHook(() => usePickSheet(nearlyDone()));

    act(() => result.current.patch((s) => ({ ...s, lockGameId: MIAMI.game.id })));
    expect(result.current.progress.remaining).toBe(0);
    expect(refresh).not.toHaveBeenCalled();

    act(() => {
      result.current.apply(refused());
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
