// @vitest-environment jsdom
/**
 * The poll loop at its interface: a screen names a path and a cadence and
 * renders what the hook holds. The seams are `fetch`, faked to answer from a
 * queue, the timers, faked, and `document.visibilityState`.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { usePoll, type Cadence } from "./use-poll";

type Body = { n: number; final?: boolean };

let answers: (() => Response)[];
let asked: { path: string; etag: string | null }[];
let visibility: DocumentVisibilityState;

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-10-24T20:00:00Z") });
  answers = [];
  asked = [];
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    asked.push({ path, etag: headers["if-none-match"] ?? null });
    return (answers.shift() ?? (() => new Response(null, { status: 304 })))();
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const fresh = (body: Body, etag: string) => () => Response.json(body, { headers: { etag } });
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const every = <T = Body>(ms: number): Cadence<T> => () => ms;

describe("asking on a cadence", () => {
  test("waits one cadence before the first ask, carrying the ETag it was last given", async () => {
    answers.push(fresh({ n: 2 }, 'W/"2"'));
    const { result } = renderHook(() => usePoll("/state", { initial: { n: 1 }, cadence: every(30_000) }));

    await advance(29_999);
    expect(asked).toHaveLength(0);
    await advance(1);
    expect(asked).toEqual([{ path: "/state", etag: null }]);
    expect(result.current.held).toEqual({ n: 2 });

    await advance(30_000);
    expect(asked[1]).toEqual({ path: "/state", etag: 'W/"2"' });
    expect(result.current.held).toEqual({ n: 2 });
  });

  test("asks at once when told to, for a body the server render did not send", async () => {
    answers.push(fresh({ n: 1 }, 'W/"1"'));
    const { result } = renderHook(() => usePoll<Body | null>("/plays", { initial: null, askFirst: true, cadence: every(30_000) }));
    await advance(0);
    expect(asked).toHaveLength(1);
    expect(result.current.held).toEqual({ n: 1 });
  });

  test("times each turn from the body it now holds, and stamps when the next ask is due", async () => {
    answers.push(fresh({ n: 2 }, 'W/"2"'));
    const cadence: Cadence<Body> = (held) => (held.n === 1 ? 300_000 : 30_000);
    const { result } = renderHook(() => usePoll("/state", { initial: { n: 1 }, cadence }));
    expect(result.current.nextPollAt).toBe(Date.now() + 300_000);

    await advance(300_000);
    expect(result.current.held).toEqual({ n: 2 });
    expect(result.current.nextPollAt).toBe(Date.now() + 30_000);
  });

  test("a cadence of null stops it, the tab coming back included", async () => {
    answers.push(fresh({ n: 2, final: true }, 'W/"2"'));
    const cadence: Cadence<Body> = (held) => (held.final ? null : 30_000);
    renderHook(() => usePoll("/plays", { initial: { n: 1 }, cadence }));

    await advance(30_000);
    expect(asked).toHaveLength(1);
    await advance(300_000);
    await act(async () => void document.dispatchEvent(new Event("visibilitychange")));
    expect(asked).toHaveLength(1);
  });

  test("passes the cadence how long the body has gone unchanged", async () => {
    const quiet: number[] = [];
    renderHook(() => usePoll("/chat", { initial: { n: 1 }, cadence: (_held, quietForMs) => (quiet.push(quietForMs), 10_000) }));
    await advance(10_000);
    await advance(10_000);
    expect(quiet).toEqual([0, 10_000, 20_000]);
  });
});

describe("a hidden tab", () => {
  test("does not ask, and asks the moment it is back", async () => {
    renderHook(() => usePoll("/state", { initial: { n: 1 }, cadence: every(30_000) }));
    visibility = "hidden";
    await advance(90_000);
    expect(asked).toHaveLength(0);

    visibility = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(asked).toHaveLength(1);
    await advance(30_000);
    expect(asked).toHaveLength(2);
  });

  test("coming back mid-ask starts no second loop", async () => {
    let release!: () => void;
    answers.push(() => new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", async (path: string) => {
      asked.push({ path, etag: null });
      await new Promise<void>((resolve) => (release = resolve));
      return new Response(null, { status: 304 });
    });
    renderHook(() => usePoll("/state", { initial: { n: 1 }, cadence: every(30_000) }));
    await advance(30_000);
    await act(async () => void document.dispatchEvent(new Event("visibilitychange")));
    expect(asked).toHaveLength(1);

    await act(async () => release());
    await advance(30_000);
    await act(async () => release());
    await advance(30_000);
    expect(asked).toHaveLength(3);
  });
});

describe("failures", () => {
  test("leave the last body standing, report the refusal, and try again on the same cadence", async () => {
    const failures: unknown[] = [];
    answers.push(() => Response.json({ error: "Gone." }, { status: 403 }));
    const { result } = renderHook(() =>
      usePoll("/chat", { initial: { n: 1 }, cadence: every(10_000), onFailed: (failure) => failures.push(failure) }),
    );
    await advance(10_000);
    expect(failures).toEqual([{ kind: "failed", status: 403, error: "Gone." }]);
    expect(result.current.held).toEqual({ n: 1 });
    await advance(10_000);
    expect(asked).toHaveLength(2);
  });
});

describe("the path", () => {
  test("null asks nothing, and a new path starts over without the old ETag", async () => {
    answers.push(fresh({ n: 2 }, 'W/"g1"'));
    const { rerender } = renderHook(({ path }) => usePoll<Body | null>(path, { initial: null, askFirst: true, cadence: every(30_000) }), {
      initialProps: { path: null as string | null },
    });
    await advance(90_000);
    expect(asked).toHaveLength(0);

    rerender({ path: "/chat?group=1" });
    await advance(0);
    rerender({ path: "/chat?group=2" });
    await advance(0);
    expect(asked).toEqual([
      { path: "/chat?group=1", etag: null },
      { path: "/chat?group=2", etag: null },
    ]);
  });
});

describe("holding a body that did not come from a poll", () => {
  test("shows it, asks next with its ETag, and counts as a change", async () => {
    const quiet: number[] = [];
    const { result } = renderHook(() =>
      usePoll("/chat", { initial: { n: 1 }, cadence: (_held, quietForMs) => (quiet.push(quietForMs), 10_000) }),
    );
    await advance(5_000);
    act(() => result.current.hold({ n: 5 }, 'W/"5"'));
    expect(result.current.held).toEqual({ n: 5 });

    await advance(5_000);
    expect(asked[0].etag).toBe('W/"5"');
    expect(quiet.at(-1)).toBe(5_000);

    act(() => result.current.hold((current) => ({ n: current.n + 1 }), null));
    expect(result.current.held).toEqual({ n: 6 });
    await advance(10_000);
    expect(asked[1].etag).toBeNull();
  });
});
