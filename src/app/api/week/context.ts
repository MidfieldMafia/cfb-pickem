import "server-only";
import { db } from "@/db";
import { currentMember } from "@/lib/members/current";
import type { PickRoute } from "@/lib/picks/http";

/**
 * The real request-scoped glue behind every pick entry route: Neon, the
 * session cookie, and the wall clock. It is the only piece of the pick API
 * that a test cannot run, which is the point — everything above it takes this
 * as an argument.
 */
export function pickRoute(): PickRoute {
  return { db: db(), currentMember };
}
