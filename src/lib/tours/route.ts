/**
 * The Tour runner's dismiss action over an injected route, so the
 * `"use server"` file stays a line and a test can run the rest. Who is
 * dismissing comes from the session, never from the caller.
 */
import "server-only";
import type { Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { isTourId } from "@/tours/ids";
import { dismissTour } from "./dismissals";

/**
 * A Tour id the app does not have. A fault, not a `Refusal`: the runner only
 * sends ids from the registry, so reaching this is a forged or stale POST
 * rather than a person asking for something wrong.
 */
export class InvalidTour extends Error {}

export interface DismissRoute {
  db: Db;
  requireMember: () => Promise<Member>;
  /** The wall clock unless given. */
  now?: () => Date;
}

/**
 * Done, Skip and Escape. The id is checked against the Tours the app has,
 * because anyone who can send the POST can send any value.
 */
export async function dismissFromAction(route: DismissRoute, tourId: unknown): Promise<void> {
  const member = await route.requireMember();
  if (!isTourId(tourId)) throw new InvalidTour(`No Tour ${String(tourId)}.`);
  await dismissTour(route.db, member.id, tourId, route.now?.() ?? new Date());
}
