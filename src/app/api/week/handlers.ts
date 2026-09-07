/**
 * The pick entry API, as two functions over an injected `PickRoute`: read the
 * sheet, or apply one edit to it. The `route.ts` files beside this one bind
 * the real database and session and export the bound handlers under the names
 * Next looks for; a route file may export nothing else, which is why the
 * handlers live here instead. A test binds a PGlite database and a seeded
 * member and calls these with a plain `Request`.
 *
 * Every write answers the whole `SheetJson`, the same shape the GET returns.
 * Three routes used to answer three bespoke bodies — a pick, a lock id, a
 * guess — each of which the screen had to fold into the sheet it was already
 * holding; now the server does that folding once and the answer is the sheet.
 */
import { asMember } from "@/lib/members/authority";
import { applyEdit, type PickEdit } from "@/lib/picks/edits";
import { integer, readBody, withPickContext, type PickRoute } from "@/lib/picks/http";
import { toSheetJson } from "@/lib/picks/json";
import { pickSheet } from "@/lib/picks/picks";

/** How one route reads its own body into the one edit shape. */
type ToEdit = (body: Record<string, unknown>) => PickEdit;

/** The signed-in member's pick sheet for the published Week, with the server clock. */
export function getSheet(route: PickRoute): Promise<Response> {
  return withPickContext(route, async ({ db, actor, slate, now }) =>
    Response.json(toSheetJson(await pickSheet(db, actor, slate, now))),
  );
}

/**
 * Applies one edit and answers the sheet it produced. The body is read before
 * the context so a malformed one is still refused as JSON, and parsed inside
 * it so a bad field comes back as a 400 rather than throwing past the route.
 */
export async function putEdit(request: Request, route: PickRoute, toEdit: ToEdit): Promise<Response> {
  const body = await readBody(request);
  return withPickContext(route, async ({ db, actor, slate, now }) =>
    Response.json(toSheetJson(await applyEdit(db, asMember(actor), slate, toEdit(body), now))),
  );
}

/** `{ gameId, teamId }`: the member's Pick in one game. */
export const pickEdit: ToEdit = (body) => ({
  kind: "pick",
  gameId: integer(body, "gameId"),
  teamId: integer(body, "teamId"),
});

/** `{ gameId }`, or `{ gameId: null }` for no Lock of the Week this week. */
export const lockEdit: ToEdit = (body) => ({
  kind: "lock",
  gameId: body.gameId === null ? null : integer(body, "gameId"),
});

/** `{ guess }`: the predicted combined final score of the Tiebreaker Game. */
export const guessEdit: ToEdit = (body) => ({ kind: "guess", guess: integer(body, "guess") });
