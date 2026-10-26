import { afterEach, describe, expect, test, vi } from "vitest";
import { conditionalGet, conditionalJson } from "./conditional";

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

describe("asking again", () => {
  test("sends the ETag it holds and keeps the one it gets back", async () => {
    const calls = answering(Response.json({ locked: true }, { headers: { etag: 'W/"b"' } }));

    const answer = await conditionalGet("/api/week/state", 'W/"a"');

    expect(answer).toEqual({ kind: "fresh", body: { locked: true }, etag: 'W/"b"' });
    expect(calls[0].path).toBe("/api/week/state");
    expect(calls[0].init.cache).toBe("no-store");
    expect(calls[0].init.headers).toEqual({ "if-none-match": 'W/"a"' });
  });

  test("sends no conditional header on the first ask", async () => {
    const calls = answering(Response.json({}));
    await conditionalGet("/api/week/state", null);
    expect(calls[0].init.headers).toEqual({});
  });

  test("a 304 is unchanged, and the body is never read", async () => {
    answering(new Response(null, { status: 304 }));
    expect(await conditionalGet("/api/week/state", 'W/"a"')).toEqual({ kind: "unchanged" });
  });

  test("a refusal fails with its status and the sentence it carried", async () => {
    answering(Response.json({ error: "You are not in that group." }, { status: 403 }));
    expect(await conditionalGet("/api/chat?group=2", null)).toEqual({ kind: "failed", status: 403, error: "You are not in that group." });

    answering(new Response("signed out", { status: 401 }));
    expect(await conditionalGet("/api/week/state", null)).toEqual({ kind: "failed", status: 401, error: null });
  });

  test("a dead connection fails quietly, with no status", async () => {
    answering(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await conditionalGet("/api/week/state", null)).toEqual({ kind: "failed", status: null, error: null });
  });
});

describe("answering a poll", () => {
  const asking = (etag?: string) => new Request("http://slate.test/api/week/state", { headers: etag ? { "if-none-match": etag } : {} });

  test("answers the body with its ETag, never to be cached", async () => {
    const response = conditionalJson(asking(), { locked: true }, 'W/"b"');
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe('W/"b"');
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ locked: true });
  });

  test("answers a 304 with no body to a request already holding that tag", async () => {
    const response = conditionalJson(asking('W/"b"'), { locked: true }, 'W/"b"');
    expect(response.status).toBe(304);
    expect(response.headers.get("etag")).toBe('W/"b"');
    expect(await response.text()).toBe("");
  });

  test("answers in full when the request holds another tag, or there is no request", async () => {
    expect(conditionalJson(asking('W/"a"'), {}, 'W/"b"').status).toBe(200);
    expect(conditionalJson(null, {}, 'W/"b"').status).toBe(200);
  });
});
