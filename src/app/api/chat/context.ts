import "server-only";
import { db } from "@/db";
import type { ChatRoute } from "@/lib/chat/http";
import { currentGroup } from "@/lib/groups/current";
import { currentMember } from "@/lib/members/current";

/** The real request-scoped glue behind the Chat routes: Neon, the session cookie and the group cookie. */
export function chatRoute(): ChatRoute {
  return { db: db(), currentMember, currentGroup };
}
