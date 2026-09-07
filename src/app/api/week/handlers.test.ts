/**
 * The pick entry API from the outside: a `Request` in, a `Response` out, over
 * the published Week 2 fixture and a real in-process database. These are the
 * only tests that run app code, and they exist for the seam the phone actually
 * meets — the status codes, and the JSON body `put` reads to decide whether to
 * flip the screen to its locked state.
 */
import { describe, expect, test, vi } from "vitest";
import type { Member } from "@/db/schema";
import { put } from "@/lib/picks/client";
import type { PickRoute } from "@/lib/picks/http";
import type { SheetJson } from "@/lib/picks/json";
import { ingestResults } from "@/lib/results/results";
import { slateFor } from "@/lib/slate/slate";
import type { WeekStateJson } from "@/lib/week/json";
import { createTestDb } from "@/test/db";
import {
  FAMU_AT_MIAMI,
  feedWith,
  OHIO_STATE_AT_TEXAS,
  OKLAHOMA_AT_MICHIGAN,
  pickAs,
  publishWeek2,
  SUNDAY,
  THURSDAY,
} from "@/test/week-2";
import { getSheet, getWeekState, guessEdit, lockEdit, pickEdit, putEdit } from "./handlers";

/** A PUT the routes would receive, with the body as JSON on the wire. */
function request(body: unknown): Request {
  return new Request("https://slate.test/api/week", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/** The published Week, plus a `PickRoute` signed in as Grandma at a given moment. */
async function setup() {
  const fixture = await publishWeek2();
  const route = (actor: Member | null, now = THURSDAY): PickRoute => ({
    db: fixture.db,
    currentMember: async () => actor,
    now: () => now,
  });
  return { ...fixture, route, asGrandma: (now?: Date) => route(fixture.grandma, now) };
}

/** The three write routes, each as its own body parser over the one handler. */
const putPick = (request: Request, route: PickRoute) => putEdit(request, route, pickEdit);
const putLock = (request: Request, route: PickRoute) => putEdit(request, route, lockEdit);
const putTiebreaker = (request: Request, route: PickRoute) => putEdit(request, route, guessEdit);

describe("pick entry routes", () => {
  test("GET returns the signed-in member's sheet, serialized", async () => {
    const { asGrandma, week, miami, michigan, texas } = await setup();

    const response = await getSheet(asGrandma());
    const sheet = await json<SheetJson>(response);

    expect(response.status).toBe(200);
    expect(sheet.weekId).toBe(week.id);
    expect(sheet.weekNumber).toBe(2);
    expect(sheet.year).toBe(2026);
    expect(sheet.locked).toBe(false);
    expect(sheet.serverNow).toBe(THURSDAY.toISOString());
    expect(sheet.games.map((g) => g.game.id)).toEqual([miami.id, michigan.id, texas.id]);
    expect(sheet.tiebreakerGameId).toBe(texas.id);
    expect(sheet.picks).toEqual([]);
  });

  test("a saved pick comes back on the sheet the save itself answers", async () => {
    const { asGrandma, michigan } = await setup();

    const saved = await putPick(request({ gameId: michigan.id, teamId: michigan.homeTeamId }), asGrandma());

    expect(saved.status).toBe(200);
    const sheet = await json<SheetJson>(saved);
    expect(sheet.picks).toEqual([
      { gameId: michigan.id, teamId: michigan.homeTeamId, updatedAt: THURSDAY.toISOString() },
    ]);
    expect(sheet.serverNow).toBe(THURSDAY.toISOString());
    // The same shape the GET answers, so a screen folds nothing in by hand.
    expect(await json(await getSheet(asGrandma()))).toEqual(sheet);
  });

  test("the Lock and the Tiebreaker Guess save through their own routes", async () => {
    const { asGrandma, michigan } = await setup();
    await putPick(request({ gameId: michigan.id, teamId: michigan.homeTeamId }), asGrandma());

    const locked = await json<SheetJson>(await putLock(request({ gameId: michigan.id }), asGrandma()));
    expect(locked.lockGameId).toBe(michigan.id);
    const guessed = await json<SheetJson>(await putTiebreaker(request({ guess: 55 }), asGrandma()));
    expect(guessed.tiebreakerGuess).toBe(55);

    const sheet = await json<SheetJson>(await getSheet(asGrandma()));
    expect(sheet.lockGameId).toBe(michigan.id);
    expect(sheet.tiebreakerGuess).toBe(55);
  });

  test("clearing the Lock is a null gameId, not a missing one", async () => {
    const { asGrandma, michigan } = await setup();
    await putPick(request({ gameId: michigan.id, teamId: michigan.homeTeamId }), asGrandma());
    await putLock(request({ gameId: michigan.id }), asGrandma());

    const cleared = await json<SheetJson>(await putLock(request({ gameId: null }), asGrandma()));

    expect(cleared.lockGameId).toBe(null);
    expect((await json<SheetJson>(await getSheet(asGrandma()))).lockGameId).toBe(null);
  });

  test("a write answers the whole sheet, progress and games included", async () => {
    const { asGrandma, michigan, miami, texas } = await setup();

    const sheet = await json<SheetJson>(
      await putPick(request({ gameId: michigan.id, teamId: michigan.homeTeamId }), asGrandma()),
    );

    expect(sheet.games.map((g) => g.game.id)).toEqual([miami.id, michigan.id, texas.id]);
    expect(sheet.progress).toMatchObject({ liveGames: 3, picksMade: 1 });
    expect(sheet.locked).toBe(false);
  });
});

describe("pick entry route refusals", () => {
  test("401 with no signed-in member", async () => {
    const { route, michigan } = await setup();

    const response = await putPick(request({ gameId: michigan.id, teamId: michigan.homeTeamId }), route(null));

    expect(response.status).toBe(401);
    expect(await json(response)).toEqual({ error: "Open your Magic Link to sign in." });
  });

  test("404 before any Week is published", async () => {
    const db = await createTestDb();
    const route: PickRoute = { db, currentMember: async () => ({ id: 1 }) as Member, now: () => THURSDAY };

    const response = await getSheet(route);

    expect(response.status).toBe(404);
    expect(await json(response)).toEqual({ error: "The slate is not posted yet." });
  });

  test("400 for a body the client should never have sent", async () => {
    const { asGrandma, michigan } = await setup();

    const missing = await putPick(request({ teamId: michigan.homeTeamId }), asGrandma());
    expect(missing.status).toBe(400);
    expect(await json(missing)).toEqual({ error: "gameId must be a whole number." });

    // A numeric string is a malformed client, not a number to be coerced.
    const stringly = await putPick(request({ gameId: String(michigan.id), teamId: michigan.homeTeamId }), asGrandma());
    expect(stringly.status).toBe(400);

    const notATeam = await putPick(request({ gameId: michigan.id, teamId: 999999 }), asGrandma());
    expect(notATeam.status).toBe(400);
    expect(await json(notATeam)).toEqual({ error: "Pick one of the two teams in the game." });
  });

  test("400 for a Lock on a game the member has not picked", async () => {
    const { asGrandma, michigan } = await setup();

    const response = await putLock(request({ gameId: michigan.id }), asGrandma());

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ error: "Pick a winner in that game before locking it." });
  });

  test("423 once the Deadline has passed, on every route that writes", async () => {
    const { asGrandma, michigan } = await setup();
    const locked = { error: "Picks are locked: the deadline has passed.", locked: true };

    const responses = await Promise.all([
      putPick(request({ gameId: michigan.id, teamId: michigan.homeTeamId }), asGrandma(SUNDAY)),
      putLock(request({ gameId: michigan.id }), asGrandma(SUNDAY)),
      putTiebreaker(request({ guess: 55 }), asGrandma(SUNDAY)),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(423);
      expect(await json(response)).toEqual(locked);
    }
  });

  test("GET still answers after the Deadline, with the sheet marked locked", async () => {
    const { asGrandma } = await setup();

    const response = await getSheet(asGrandma(SUNDAY));

    expect(response.status).toBe(200);
    expect((await json<SheetJson>(response)).locked).toBe(true);
  });
});

describe("what the phone makes of a refusal", () => {
  /** `put` over a handler: the response the route would send, read back by the browser helper. */
  async function through(response: Promise<Response>) {
    const sent = await response;
    // One request, answered by the handler above; `put` clones nothing, so hand it the body once.
    vi.stubGlobal("fetch", async () => sent);
    try {
      return await put<{ serverNow: string }>("/api/week/picks", {});
    } finally {
      vi.unstubAllGlobals();
    }
  }

  test("a 423 becomes locked, so the screen can flip itself", async () => {
    const { asGrandma, michigan } = await setup();

    const result = await through(
      putPick(request({ gameId: michigan.id, teamId: michigan.homeTeamId }), asGrandma(SUNDAY)),
    );

    expect(result).toEqual({ ok: false, error: "Picks are locked: the deadline has passed.", locked: true });
  });

  test("a 400 is a message to show, not a lock", async () => {
    const { asGrandma } = await setup();

    const result = await through(putPick(request({}), asGrandma()));

    expect(result).toEqual({ ok: false, error: "gameId must be a whole number.", locked: false });
  });

  test("a save that works comes back as the body", async () => {
    const { asGrandma, michigan } = await setup();

    const result = await through(putPick(request({ gameId: michigan.id, teamId: michigan.homeTeamId }), asGrandma()));

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ ok: true, body: { serverNow: THURSDAY.toISOString() } });
  });
});

/** A poll the Live Board would send: a GET, carrying the ETag it last saw when it has one. */
function poll(etag?: string): Request {
  return new Request("https://slate.test/api/week/state", { headers: etag ? { "if-none-match": etag } : {} });
}

describe("the week state", () => {
  test("before the Deadline it carries the slate and nobody's picks, scores, or board", async () => {
    const { asGrandma, week, slate, grandma, michigan, miami, texas, db } = await setup();
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);

    const response = await getWeekState(poll(), asGrandma());
    const state = await json<WeekStateJson>(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(state.week.id).toBe(week.id);
    expect(state.year).toBe(2026);
    expect(state.locked).toBe(false);
    expect(state.complete).toBe(false);
    expect(state.serverNow).toBe(THURSDAY.toISOString());
    expect(state.games.map((g) => g.game.id)).toEqual([miami.id, michigan.id, texas.id]);
    // Grandma's own pick is in the database; the state still says nothing, because nobody's picks show early.
    expect(state.games.every((g) => g.picks.length === 0)).toBe(true);
    expect(state.members).toEqual([]);
    expect(state.scores).toBeNull();
    expect(state.weeklyWin).toBeNull();
  });

  test("after the Deadline it carries everyone's picks, graded, and the provisional standings", async () => {
    const { asGrandma, slate, grandma, jonah, michigan, texas, db } = await setup();
    await pickAs(db, grandma, slate, michigan, michigan.homeTeamId, THURSDAY);
    await pickAs(db, jonah, slate, michigan, michigan.awayTeamId, THURSDAY);
    await pickAs(db, jonah, slate, texas, texas.homeTeamId, THURSDAY);
    const feed = feedWith({ [OKLAHOMA_AT_MICHIGAN]: [24, 27] }, { [OHIO_STATE_AT_TEXAS]: [3, 0, 1, "12:00"] });

    const state = await json<WeekStateJson>(await getWeekState(poll(), { ...asGrandma(SUNDAY), cfbd: () => feed }));

    // The poll drove the feed on the way through, once, and read what it wrote.
    expect(feed.calls).toBe(1);
    expect(state.locked).toBe(true);
    expect(state.complete).toBe(false);
    expect(state.members.map((m) => m.displayName)).toEqual(["Jonah", "Grandma"]);
    const michiganRow = state.games.find((g) => g.game.id === michigan.id)!;
    expect(michiganRow.result.label).toBe("Final");
    expect(michiganRow.picks.map((p) => [p.memberId, p.outcome])).toEqual([
      [jonah.id, "incorrect"],
      [grandma.id, "correct"],
    ]);
    const texasRow = state.games.find((g) => g.game.id === texas.id)!;
    expect(texasRow.result.live).toEqual({ awayScore: 3, homeScore: 0, period: 1, clock: "12:00" });
    expect(texasRow.picks.map((p) => [p.memberId, p.outcome])).toEqual([[jonah.id, "pending"]]);
    // Provisional: Texas is not final, so Jonah's pick there counts nothing yet.
    expect(state.scores!.map((s) => [s.member.displayName, s.points, s.pending])).toEqual([
      ["Grandma", 10, 0],
      ["Jonah", 0, 1],
    ]);
  });

  test("answers 304 to the ETag it sent while the Week has not moved, and a fresh body once it has", async () => {
    const { asGrandma, week, db } = await setup();
    const friday = new Date("2026-09-11T01:00:00Z");
    const later = new Date(friday.getTime() + 30_000);

    const first = await getWeekState(poll(), asGrandma(friday));
    const etag = first.headers.get("etag")!;
    expect(etag).toMatch(/^W\/"[0-9a-f]+"$/);

    // Thirty seconds on, nothing has changed but the clock: the clock is not the Week.
    const again = await getWeekState(poll(etag), asGrandma(later));
    expect(again.status).toBe(304);
    expect(again.headers.get("etag")).toBe(etag);
    expect(await again.text()).toBe("");

    // A score lands: the same ETag no longer matches, and the body says why.
    await ingestResults(db, feedWith({ [FAMU_AT_MIAMI]: [7, 45] }), await slateFor(db, week.id), later);
    const moved = await getWeekState(poll(etag), asGrandma(later));
    expect(moved.status).toBe(200);
    expect(moved.headers.get("etag")).not.toBe(etag);
    const state = await json<WeekStateJson>(moved);
    expect(state.games[0].result).toMatchObject({ status: "final", awayScore: 7, homeScore: 45 });
  });

  test("a feed that will not answer leaves the state readable with the scores it had", async () => {
    const { asGrandma } = await setup();
    const angry = () => {
      throw new Error("CFBD_API_KEY is not set");
    };

    const response = await getWeekState(poll(), { ...asGrandma(SUNDAY), cfbd: angry });

    expect(response.status).toBe(200);
    expect((await json<WeekStateJson>(response)).locked).toBe(true);
  });

  test("401 signed out, 404 before any Week is published", async () => {
    const { route } = await setup();
    expect((await getWeekState(poll(), route(null))).status).toBe(401);

    const empty: PickRoute = { db: await createTestDb(), currentMember: async () => ({ id: 1 }) as Member };
    expect((await getWeekState(poll(), empty)).status).toBe(404);
  });
});
