import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { groups, memberships, type Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { unreadCount, type ThreadMessage } from "@/lib/chat/chat";
import type { PushPayload } from "./payload";
import type { Pusher } from "./sender";
import { deliver, subscribedDevices, type Delivery } from "./subscriptions";

/** How much of a message the banner shows; iOS truncates around here anyway. */
const PREVIEW_CHARS = 140;

export function chatPreview(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > PREVIEW_CHARS ? `${oneLine.slice(0, PREVIEW_CHARS - 1)}…` : oneLine;
}

/**
 * Tells the rest of the Group about a new message: every member of it but
 * the author, on each device that takes Chat notifications. The badge is
 * that member's unread count in the Group, so the icon shows what the tab
 * would. Nothing here throws: a post that landed is a post that landed.
 */
export async function notifyChat(
  db: Db,
  pusher: Pusher | null,
  author: Pick<Member, "id" | "displayName">,
  groupId: number,
  message: ThreadMessage,
  now: Date = new Date(),
): Promise<Delivery> {
  const none: Delivery = { sent: 0, gone: 0, failed: 0 };
  if (!pusher) return none;
  try {
    const [group] = await db.select({ name: groups.name }).from(groups).where(eq(groups.id, groupId));
    if (!group) return none;
    const others = await db
      .select({ memberId: memberships.memberId })
      .from(memberships)
      .where(and(eq(memberships.groupId, groupId), ne(memberships.memberId, author.id)));
    const devices = await subscribedDevices(
      db,
      others.map((m) => m.memberId),
      "chat",
    );
    if (devices.length === 0) return none;
    const badges = new Map<number, number>();
    await Promise.all(
      [...new Set(devices.map((d) => d.memberId))].map(async (memberId) => {
        badges.set(memberId, await unreadCount(db, memberId, groupId));
      }),
    );
    const payload = (memberId: number): PushPayload => ({
      title: group.name,
      body: `${author.displayName}: ${chatPreview(message.text)}`,
      url: "/chat",
      tag: `chat-${groupId}`,
      badge: badges.get(memberId) ?? null,
    });
    return await deliver(db, pusher, devices, (device) => payload(device.memberId), now);
  } catch (error) {
    console.warn("Chat push skipped:", error instanceof Error ? error.message : error);
    return none;
  }
}
