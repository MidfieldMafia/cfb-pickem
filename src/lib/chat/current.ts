import "server-only";
import { db } from "@/db";
import type { Member } from "@/db/schema";
import { currentGroup } from "@/lib/groups/current";
import { unreadCount } from "./chat";

/** The Chat tab's first count, for a screen drawing the bottom nav: the Group on screen, from the request's cookie. */
export async function currentChatUnread(member: Pick<Member, "id">): Promise<number> {
  const group = await currentGroup();
  return group === null ? 0 : unreadCount(db(), member.id, group);
}
