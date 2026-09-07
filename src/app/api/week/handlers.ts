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
import { createHash } from "node:crypto";
import { asMember } from "@/lib/members/authority";
import { applyEdit, type PickEdit } from "@/lib/picks/edits";
import { integer, readBody, withPickContext, type ApiError, type PickRoute } from "@/lib/picks/http";
import { toSheetJson } from "@/lib/picks/json";
import { pickSheet } from "@/lib/picks/picks";
import { toWeekStateJson, type WeekStateJson } from "@/lib/week/json";
import { currentWeek } from "@/lib/week/week";

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

/**
 * The ETag of a week state: a digest of everything in it but the server
 * clock, which moves on every request and would otherwise make every poll a
 * change. Weak, because two bodies that differ only in `serverNow` are the
 * same Week and are meant to match.
 */
function weekStateEtag(state: WeekStateJson): string {
  const digest = createHash("sha1")
    .update(JSON.stringify({ ...state, serverNow: null }))
    .digest("hex");
  return `W/"${digest.slice(0, 20)}"`;
}

/**
 * The whole current Week in one payload for the Live Board: the Slate with
 * its live scores, everyone's picks and the provisional standings once the
 * Deadline has passed, and the server clock. A poll carries the ETag it last
 * saw and gets a 304 with no body while the Week has not moved.
 *
 * The feed is pulled on the way through, on the same stale gate `/week` and
 * `/results` drive, so a phone polling every thirty seconds costs the quota
 * nothing beyond the one call per interval the gate allows — and a feed that
 * will not answer leaves the Week readable with the scores it had.
 *
 * 401 and 404 match `withPickContext`; this does not go through it because
 * `currentWeek` already composes the Week from the published Slate, and
 * reading the Slate twice per poll would be the one cost the poll can avoid.
 */
export async function getWeekState(request: Request, route: PickRoute): Promise<Response> {
  const actor = await route.currentMember();
  if (!actor) return Response.json({ error: "Open your Magic Link to sign in." } satisfies ApiError, { status: 401 });
  const week = await currentWeek(route.db, actor, route.now?.() ?? new Date(), { graded: true, season: true, cfbd: route.cfbd });
  if (!week) return Response.json({ error: "The slate is not posted yet." } satisfies ApiError, { status: 404 });
  const state = toWeekStateJson(week);
  const etag = weekStateEtag(state);
  // `no-store`: the browser must not answer a later poll from its own cache, and the 304 must reach the script.
  const headers = { etag, "cache-control": "no-store" };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return Response.json(state, { headers });
}
