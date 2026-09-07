import "server-only";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import type { ConsoleRoute } from "@/lib/console/route";
import { requireConsole } from "@/lib/members/current";

/**
 * The real request-scoped glue behind every console edit: Neon, the session
 * cookie, Next's cache invalidation, and the wall clock. It is the only piece
 * of the console a test cannot run, which is the point — everything above it
 * takes this as an argument.
 */
export function consoleRoute(): ConsoleRoute {
  return { db: db(), requireConsole, revalidate: revalidatePath };
}
