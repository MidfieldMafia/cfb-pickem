/**
 * The pick entry API, as four functions over an injected `PickRoute`. The
 * `route.ts` files beside this one bind the real database and session and
 * export the bound handlers under the names Next looks for; a route file may
 * export nothing else, which is why the handlers live here instead. A test
 * binds a PGlite database and a seeded member and calls these with a plain
 * `Request`.
 */
import { integer, readBody, withPickContext, type PickRoute } from "@/lib/picks/http";
import { toSheetJson } from "@/lib/picks/json";
import { pickSheet, savePick, setLock, setTiebreakerGuess } from "@/lib/picks/picks";

/** The signed-in member's pick sheet for the published Week, with the server clock. */
export function getSheet(route: PickRoute): Promise<Response> {
  return withPickContext(route, async ({ db, actor, slate, now }) =>
    Response.json(toSheetJson(await pickSheet(db, actor, slate, now))),
  );
}

/** Saves one Pick: `{ gameId, teamId }`. Replaces any earlier pick in that game. */
export async function putPick(request: Request, route: PickRoute): Promise<Response> {
  const body = await readBody(request);
  return withPickContext(route, async ({ db, actor, slate, now }) => {
    const pick = await savePick(db, actor, slate.week.id, integer(body, "gameId"), integer(body, "teamId"), now);
    return Response.json({
      pick: { gameId: pick.gameId, teamId: pick.teamId, updatedAt: pick.updatedAt.toISOString() },
      serverNow: now.toISOString(),
    });
  });
}

/** Sets the Lock of the Week: `{ gameId }`, or `{ gameId: null }` for no Lock this week. */
export async function putLock(request: Request, route: PickRoute): Promise<Response> {
  const body = await readBody(request);
  return withPickContext(route, async ({ db, actor, slate, now }) => {
    const gameId = body.gameId === null ? null : integer(body, "gameId");
    await setLock(db, actor, slate.week.id, gameId, now);
    return Response.json({ lockGameId: gameId, serverNow: now.toISOString() });
  });
}

/** Records the Tiebreaker Guess: `{ guess }`, the predicted combined final score. */
export async function putTiebreaker(request: Request, route: PickRoute): Promise<Response> {
  const body = await readBody(request);
  return withPickContext(route, async ({ db, actor, slate, now }) => {
    const guess = integer(body, "guess");
    await setTiebreakerGuess(db, actor, slate.week.id, guess, now);
    return Response.json({ tiebreakerGuess: guess, serverNow: now.toISOString() });
  });
}
