import { afterEach, describe, expect, test, vi } from "vitest";
import { fetchWeekState, WEEK_STATE_PATH } from "./client";

afterEach(() => vi.unstubAllGlobals());

/** Stubs `fetch` with one canned response and records what was sent. */
function answering(response: Response | (() => Promise<Response>)) {
  const calls: { path: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    calls.push({ path, init });
    return typeof response === "function" ? response() : response;
  });
  return calls;
}

describe("fetching the week state", () => {
  test("sends the ETag it holds and keeps the one it gets back", async () => {
    const calls = answering(Response.json({ locked: true }, { headers: { etag: 'W/"b"' } }));

    const result = await fetchWeekState('W/"a"');

    expect(result).toEqual({ kind: "fresh", state: { locked: true }, etag: 'W/"b"' });
    expect(calls[0].path).toBe(WEEK_STATE_PATH);
    expect(calls[0].init.cache).toBe("no-store");
    expect(calls[0].init.headers).toEqual({ "if-none-match": 'W/"a"' });
  });

  test("sends no conditional header on the first read", async () => {
    const calls = answering(Response.json({}));
    await fetchWeekState(null);
    expect(calls[0].init.headers).toEqual({});
  });

  test("a 304 is unchanged, and the body is never read", async () => {
    answering(new Response(null, { status: 304 }));
    expect(await fetchWeekState('W/"a"')).toEqual({ kind: "unchanged" });
  });

  test("a refusal and a dead connection both fail quietly", async () => {
    answering(new Response("signed out", { status: 401 }));
    expect(await fetchWeekState(null)).toEqual({ kind: "failed" });

    answering(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await fetchWeekState(null)).toEqual({ kind: "failed" });
  });
});
