import "server-only";
import { after } from "next/server";
import { db } from "@/db";
import type { ChatRoute } from "@/lib/chat/http";
import { currentGroup } from "@/lib/groups/current";
import { currentMember } from "@/lib/members/current";
import { pusherFromEnv } from "@/lib/push/sender";

/** The real request-scoped glue behind the Chat routes: Neon, the session cookie, the group cookie, and push after the response. */
export function chatRoute(): ChatRoute {
  return { db: db(), currentMember, currentGroup, pusher: pusherFromEnv, afterResponse: after };
}
