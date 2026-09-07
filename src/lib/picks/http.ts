/**
 * Shared plumbing for the pick entry route handlers: who is asking, which
 * Week is open, and how a refused change comes back as JSON the phone can
 * show. Status codes: 400 for a bad pick, 401 signed out, 403 hidden picks,
 * 404 no published slate, 423 the Deadline has passed.
 */
import type { Member } from "@/db/schema";
import type { Db } from "@/db/types";
import type { CfbdClient } from "@/lib/cfbd/types";
import { integerField } from "@/lib/parse";
import { publishedSlate, type Slate } from "@/lib/slate/slate";
import { toSheetJson, type SheetJson } from "./json";
import { DeadlinePassed, InvalidPick, pickSheet, PicksHidden } from "./picks";

import type { ApiError } from "./client";

export type { ApiError };

/**
 * The request-scoped glue a pick handler runs on: this request's database, who
 * is signed in, and the server clock. Handed in rather than imported, because
 * that glue belongs to the app and not to this module — and because injecting
 * it is what lets a test drive a handler with a plain `Request` against an
 * in-process database.
 */
export interface PickRoute {
  db: Db;
  currentMember: () => Promise<Member | null>;
  /** The wall clock unless given; a test pins it to a moment inside the fixture's Week. */
  now?: () => Date;
  /**
   * The feed, for the one route that keeps scores fresh on the way through
   * (`getWeekState`). A factory rather than a client, for the reason
   * `WeekOptions.cfbd` is: building the production one reads the environment.
   * Absent, the route reads the rows as they stand — which is every test that
   * is not about the feed.
   */
  cfbd?: () => CfbdClient;
}

/**
 * A refusal as JSON the phone can show. `sheet` is the server's answer to send
 * with a 423 and is ignored by every other branch; omitted, a 423 still sends
 * the refusal alone, which is what a caller with no context to read it from
 * gets.
 *
 * The `instanceof` order is load-bearing: `DeadlinePassed extends InvalidPick`,
 * so testing the general class first would answer 400 for a passed Deadline and
 * the screen would never flip to locked.
 */
export function errorResponse(error: unknown, sheet?: SheetJson): Response {
  if (error instanceof DeadlinePassed) {
    return Response.json({ error: error.message, locked: true, sheet } satisfies ApiError<SheetJson>, { status: 423 });
  }
  if (error instanceof PicksHidden) return Response.json({ error: error.message } satisfies ApiError, { status: 403 });
  if (error instanceof InvalidPick) return Response.json({ error: error.message } satisfies ApiError, { status: 400 });
  throw error;
}

/**
 * The sheet to send with a 423. Best effort on purpose: the refusal is the part
 * that must arrive, so a sheet that cannot be read must not turn a 423 into a
 * 500 and leave the screen with neither.
 */
async function refusalSheet(db: Db, actor: Member, slate: Slate, now: Date): Promise<SheetJson | undefined> {
  try {
    return toSheetJson(await pickSheet(db, actor, slate, now));
  } catch {
    return undefined;
  }
}

/**
 * Runs a handler for the signed-in member against the published Week. The
 * HTTP face of `currentWeek`: the same Slate, loaded once and handed down, so
 * a handler that needs the sheet builds it from these rows instead of reading
 * the Week again. It stops short of building the sheet itself — three of the
 * four routes only save a change, and would pay for a sheet nobody reads.
 * "No published Week" is the 404, the one shape `currentWeek`'s null takes here.
 *
 * A passed Deadline is the exception: that refusal answers with the sheet, so
 * the screen adopts server truth instead of reverting to a remembered local
 * value. It is read here rather than in the handlers because this is where the
 * refusal is caught, and here the Slate and the clock are already in hand.
 */
export async function withPickContext(
  route: PickRoute,
  work: (ctx: { db: Db; actor: Member; slate: Slate; now: Date }) => Promise<Response>,
): Promise<Response> {
  // Independent lookups: the phone waits for one round trip, not two.
  const [actor, slate] = await Promise.all([route.currentMember(), publishedSlate(route.db)]);
  if (!actor) return Response.json({ error: "Open your Magic Link to sign in." } satisfies ApiError, { status: 401 });
  if (!slate) return Response.json({ error: "The slate is not posted yet." } satisfies ApiError, { status: 404 });
  const now = route.now?.() ?? new Date();
  try {
    return await work({ db: route.db, actor, slate, now });
  } catch (error) {
    // Only a 423 carries one, and only it pays for the extra read.
    const sheet = error instanceof DeadlinePassed ? await refusalSheet(route.db, actor, slate, now) : undefined;
    return errorResponse(error, sheet);
  }
}

/** A JSON body as a record, or an empty one when the body is missing or malformed. */
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** A required whole number from a JSON body, worded for the phone. */
export function integer(body: Record<string, unknown>, key: string): number {
  return integerField(body, key, (name) => new InvalidPick(`${name} must be a whole number.`));
}
