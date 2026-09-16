import "server-only";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db } from "@/db";
import { appUrl } from "@/lib/app-url";
import type { ManageRoute } from "@/lib/groups/manage-route";
import { SESSION_COOKIE } from "@/lib/members/cookie";
import { requireMember } from "@/lib/members/current";

/** The request-scoped glue behind every Manage edit, as `console/context.ts` is for the console. */
export async function manageRoute(): Promise<ManageRoute> {
  const sessionId = (await cookies()).get(SESSION_COOKIE)?.value;
  return { db: db(), requireMember, revalidate: revalidatePath, appUrl: appUrl(), sessionId };
}
