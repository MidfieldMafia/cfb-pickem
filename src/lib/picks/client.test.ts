/**
 * The one PUT helper the pick flow and the review screen share. It never
 * throws, because every caller is a tap on a phone that has to keep working:
 * the failure paths below are the whole point of the module.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { put } from "./client";

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

describe("put", () => {
  test("sends the body as JSON and returns the parsed response", async () => {
    const calls = answering(Response.json({ lockGameId: 4, serverNow: "2026-09-10T20:00:00.000Z" }));

    const result = await put<{ lockGameId: number; serverNow: string }>("/api/week/lock", { gameId: 4 });

    expect(result).toEqual({ ok: true, body: { lockGameId: 4, serverNow: "2026-09-10T20:00:00.000Z" } });
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe("/api/week/lock");
    expect(calls[0].init.method).toBe("PUT");
    expect(calls[0].init.headers).toEqual({ "content-type": "application/json" });
    expect(calls[0].init.body).toBe('{"gameId":4}');
  });

  test("a 423 comes back as locked, which is how a screen learns the Deadline passed under it", async () => {
    answering(Response.json({ error: "Picks are locked: the deadline has passed.", locked: true }, { status: 423 }));

    const result = await put("/api/week/picks", { gameId: 4, teamId: 9 });

    expect(result).toEqual({ ok: false, error: "Picks are locked: the deadline has passed.", locked: true });
  });

  test("a refusal without `locked` shows its message and leaves the screen open", async () => {
    answering(Response.json({ error: "Pick one of the two teams in the game." }, { status: 400 }));

    const result = await put("/api/week/picks", { gameId: 4, teamId: 9 });

    expect(result).toEqual({ ok: false, error: "Pick one of the two teams in the game.", locked: false });
  });

  test("an error body that is not the shape we send still gets a message to show", async () => {
    answering(new Response("<html>502 Bad Gateway</html>", { status: 502 }));

    const result = await put("/api/week/picks", {});

    expect(result).toEqual({ ok: false, error: "That didn't save. Try again.", locked: false });
  });

  test("no connection is its own message, and never a lock", async () => {
    answering(() => Promise.reject(new TypeError("Failed to fetch")));

    const result = await put("/api/week/picks", { gameId: 4, teamId: 9 });

    expect(result).toEqual({ ok: false, error: "No connection. Try again.", locked: false });
  });
});
