/**
 * Which Tours a member has dismissed (#429, spec #426). Done, Skip and Escape
 * all write the same row and it is permanent; leaving mid-Tour writes nothing,
 * so the Tour starts again from its first Stop on the next landing.
 */
import "server-only";
import { and, eq } from "drizzle-orm";
import { tourDismissals } from "@/db/schema";
import type { Db } from "@/db/types";
import type { TourId } from "@/tours/ids";

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
