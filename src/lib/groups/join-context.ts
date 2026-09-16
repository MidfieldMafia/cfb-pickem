import "server-only";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db } from "@/db";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/members/cookie";
import { currentMember } from "@/lib/members/current";
import { CURRENT_GROUP_COOKIE, currentGroupCookieOptions } from "./current";
import type { JoinRoute } from "./join-route";

/** The request-scoped glue behind the Join Link, Start a group, and You screen forms. */
export async function joinRoute(): Promise<JoinRoute> {
  return {
    db: db(),
    currentMember,
    signIn: async (sessionId) => {
      (await cookies()).set(SESSION_COOKIE, sessionId, sessionCookieOptions());
    },
    showGroup: async (groupId) => {
      (await cookies()).set(CURRENT_GROUP_COOKIE, String(groupId), currentGroupCookieOptions());
    },
    revalidate: revalidatePath,
  };
}
