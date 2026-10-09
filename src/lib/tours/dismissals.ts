/**
 * Which Tours a member has dismissed (#429, spec #426). Done, Skip and Escape
 * all write the same row and it is permanent; leaving mid-Tour writes nothing,
 * so the Tour starts again from its first Stop on the next landing.
 */
import "server-only";
import { and, eq } from "drizzle-orm";
import { tourDismissals, type Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { Refusal } from "@/lib/refusal";
import { isTourId, type TourId } from "@/tours/ids";

export class InvalidTour extends Refusal {}

/**
 * Whether the member has dismissed `tourId`, for the `(member)` layout to
 * decide whether to start it. A read that fails counts as dismissed: a fault
 * shows no Tour rather than one the member already ended.
 */
export async function tourDismissed(db: Db, memberId: number, tourId: TourId): Promise<boolean> {
  try {
    const [row] = await db
      .select({ tourId: tourDismissals.tourId })
      .from(tourDismissals)
      .where(and(eq(tourDismissals.memberId, memberId), eq(tourDismissals.tourId, tourId)))
      .limit(1);
    return row !== undefined;
  } catch (error) {
    console.warn("Tour dismissal read failed:", error instanceof Error ? error.message : error);
    return true;
  }
}

/** Records the dismissal. A second one is a no-op and keeps the first time. */
export async function dismissTour(db: Db, memberId: number, tourId: TourId, now: Date): Promise<void> {
  await db.insert(tourDismissals).values({ memberId, tourId, dismissedAt: now }).onConflictDoNothing();
}

export interface DismissRoute {
  db: Db;
  requireMember: () => Promise<Member>;
  /** The wall clock unless given. */
  now?: () => Date;
}

/**
 * The server action's body, so the `"use server"` file stays one line. The
 * member comes from the session, and the id is checked against the Tours the
 * app has, because anyone who can send the POST can send any value.
 */
export async function dismissFor(route: DismissRoute, tourId: unknown): Promise<void> {
  const member = await route.requireMember();
  if (!isTourId(tourId)) throw new InvalidTour("No such Tour.");
  await dismissTour(route.db, member.id, tourId, route.now?.() ?? new Date());
}
