/**
 * The pieces of the pick API that hold no database: which refusal becomes
 * which status, and how a request body is read. `withPickContext` itself is
 * exercised against a real Week in `src/app/api/week/handlers.test.ts`.
 */
import { describe, expect, test } from "vitest";
import { MAX_INT } from "@/lib/parse";
import { errorResponse, integer, readBody, type ApiError } from "./http";
import { DeadlinePassed, InvalidPick, PicksHidden } from "./picks";

async function body(response: Response): Promise<ApiError> {
  return (await response.json()) as ApiError;
}

describe("errorResponse", () => {
  test("a passed Deadline is 423, and says so in the body as well as the status", async () => {
    const response = errorResponse(new DeadlinePassed());

    expect(response.status).toBe(423);
    // `locked` is what the browser reads; `put` never sees the status code.
    expect(await body(response)).toEqual({ error: "Picks are locked: the deadline has passed.", locked: true });
  });

  test("asking for hidden picks is 403", async () => {
    const response = errorResponse(new PicksHidden());

    expect(response.status).toBe(403);
    expect(await body(response)).toEqual({ error: "Picks stay hidden until the deadline." });
  });

  test("a bad pick is 400", async () => {
    const response = errorResponse(new InvalidPick("Pick one of the two teams in the game."));

    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error: "Pick one of the two teams in the game." });
  });

  test("DeadlinePassed is checked before InvalidPick it extends", () => {
    expect(new DeadlinePassed()).toBeInstanceOf(InvalidPick);
    expect(errorResponse(new DeadlinePassed()).status).toBe(423);
  });

  test("anything else is a bug, and is rethrown rather than dressed as a refusal", () => {
    const bug = new TypeError("undefined is not a function");

    expect(() => errorResponse(bug)).toThrow(bug);
  });
});

describe("readBody", () => {
  const put = (init: RequestInit) => new Request("https://slate.test/api/week/picks", { method: "PUT", ...init });

  test("reads a JSON object", async () => {
    expect(await readBody(put({ body: JSON.stringify({ gameId: 7 }) }))).toEqual({ gameId: 7 });
  });

  test("a missing, malformed, or non-object body is an empty record, not a crash", async () => {
    expect(await readBody(put({}))).toEqual({});
    expect(await readBody(put({ body: "{" }))).toEqual({});
    expect(await readBody(put({ body: "42" }))).toEqual({});
    expect(await readBody(put({ body: "null" }))).toEqual({});
  });

  test("a JSON array carries no field, so the handler above refuses it as a missing one", async () => {
    const read = await readBody(put({ body: "[1,2]" }));

    expect(() => integer(read, "gameId")).toThrow(InvalidPick);
  });
});

describe("integer", () => {
  test("takes a whole number", () => {
    expect(integer({ gameId: 12 }, "gameId")).toBe(12);
    expect(integer({ guess: 0 }, "guess")).toBe(0);
    expect(integer({ guess: MAX_INT }, "guess")).toBe(MAX_INT);
  });

  test("refuses anything a well-formed client would not send", () => {
    // A negative or oversized number is refused here rather than by Postgres.
    for (const value of ["12", 1.5, -3, MAX_INT + 1, null, undefined, true, NaN, Infinity, {}]) {
      expect(() => integer({ gameId: value }, "gameId")).toThrow(InvalidPick);
    }
  });

  test("names the field it refused, so the message reaches the right place", () => {
    expect(() => integer({}, "teamId")).toThrow("teamId must be a whole number.");
  });
});
