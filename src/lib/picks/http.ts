/**
 * Shared plumbing for the pick entry route handlers: who is asking, which
 * Week is open, and how a refused change comes back as JSON the phone can
 * show. Status codes: 400 for a bad pick, 401 signed out, 403 hidden picks,
 * 404 no published slate, 423 the Deadline has passed.
 */
import { db } from "@/db";
import type { Member } from "@/db/schema";
import { currentMember } from "@/lib/members/current";
import { safeInteger } from "@/lib/parse";
import { publishedSlate, type Slate } from "@/lib/slate/slate";
import { DeadlinePassed, InvalidPick, PicksHidden } from "./picks";

import type { ApiError } from "./client";

export type { ApiError };

export function errorResponse(error: unknown): Response {
  if (error instanceof DeadlinePassed) {
    return Response.json({ error: error.message, locked: true } satisfies ApiError, { status: 423 });
  }
  if (error instanceof PicksHidden) return Response.json({ error: error.message } satisfies ApiError, { status: 403 });
  if (error instanceof InvalidPick) return Response.json({ error: error.message } satisfies ApiError, { status: 400 });
  throw error;
}

/**
 * Runs a handler for the signed-in member against the published Week. The
 * HTTP face of `currentWeek`: the same Slate, loaded once and handed down, so
 * a handler that needs the sheet builds it from these rows instead of reading
 * the Week again. It stops short of building the sheet itself — three of the
 * four routes only save a change, and would pay for a sheet nobody reads.
 * "No published Week" is the 404, the one shape `currentWeek`'s null takes here.
 */
export async function withPickContext(
  work: (ctx: { actor: Member; slate: Slate; now: Date }) => Promise<Response>,
): Promise<Response> {
  // Independent lookups: the phone waits for one round trip, not two.
  const [actor, slate] = await Promise.all([currentMember(), publishedSlate(db())]);
  if (!actor) return Response.json({ error: "Open your Magic Link to sign in." } satisfies ApiError, { status: 401 });
  if (!slate) return Response.json({ error: "The slate is not posted yet." } satisfies ApiError, { status: 404 });
  try {
    return await work({ actor, slate, now: new Date() });
  } catch (error) {
    return errorResponse(error);
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

export function integer(body: Record<string, unknown>, key: string): number {
  // A JSON body must carry a real number; a numeric string is a malformed client.
  const value = typeof body[key] === "number" ? safeInteger(body[key]) : null;
  if (value === null) throw new InvalidPick(`${key} must be a whole number.`);
  return value;
}
