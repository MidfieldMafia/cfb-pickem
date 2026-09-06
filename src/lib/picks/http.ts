/**
 * Shared plumbing for the pick entry route handlers: who is asking, which
 * Week is open, and how a refused change comes back as JSON the phone can
 * show. Status codes: 400 for a bad pick, 401 signed out, 403 hidden picks,
 * 404 no published slate, 423 the Deadline has passed.
 */
import { db } from "@/db";
import { currentMember } from "@/lib/members/current";
import { publishedSlate } from "@/lib/slate/slate";
import { DeadlinePassed, InvalidPick, PicksHidden } from "./picks";

export interface ApiError {
  error: string;
  /** True when the Deadline has passed, so the client can flip to its locked state. */
  locked?: boolean;
}

export function errorResponse(error: unknown): Response {
  if (error instanceof DeadlinePassed) {
    return Response.json({ error: error.message, locked: true } satisfies ApiError, { status: 423 });
  }
  if (error instanceof PicksHidden) return Response.json({ error: error.message } satisfies ApiError, { status: 403 });
  if (error instanceof InvalidPick) return Response.json({ error: error.message } satisfies ApiError, { status: 400 });
  throw error;
}

/** Runs a handler for the signed-in member against the published Week. */
export async function withPickContext(
  work: (ctx: { actor: NonNullable<Awaited<ReturnType<typeof currentMember>>>; weekId: number; now: Date }) => Promise<Response>,
): Promise<Response> {
  const actor = await currentMember();
  if (!actor) return Response.json({ error: "Open your Magic Link to sign in." } satisfies ApiError, { status: 401 });
  const slate = await publishedSlate(db());
  if (!slate) return Response.json({ error: "The slate is not posted yet." } satisfies ApiError, { status: 404 });
  try {
    return await work({ actor, weekId: slate.week.id, now: new Date() });
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
  const value = body[key];
  if (typeof value !== "number" || !Number.isInteger(value)) throw new InvalidPick(`${key} must be a whole number.`);
  return value;
}
