/**
 * Chat pushes (#530, rules on #493): what a new message sends, and to whom.
 * `postChat` runs `pushChatMessage` in `after()` once the message is saved, so
 * the post never waits on the push services.
 *
 * Each Member of the Group but the author is weighed on their own, by their
 * Chat setting (`members.notify_chat`):
 *
 * - **Off**: nothing, mentions included.
 * - **A mention** of them, by name or `@everyone` (a `chat_mentions` row),
 *   pushes under All and @mentions, with a tag of its own so a later Chat
 *   banner does not replace it. It counts as their catch-up push.
 * - **All messages**: only the first message since they last read the Chat
 *   pushes, then nothing until they open it again. One tag per Group, so a new
 *   banner replaces the old.
 *
 * Nobody watching is pushed: a read in the last 15 s (`memberships.chat_read_at`,
 * which the open thread's 4 s poll keeps moving). Nobody without a device is
 * weighed at all. Every push is reserved before it goes (`reservations.ts`).
 */
import "server-only";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { chatMentions, groups, memberships, members } from "@/db/schema";
import type { Db } from "@/db/types";
import { pushToMember } from "@/lib/push/deliver";
import { pushKey, reserve } from "@/lib/push/reservations";
import type { Pusher, PushPayload } from "@/lib/push/sender";
import { membersWithDevices } from "@/lib/push/settings";
import { mentionable, unreadCount } from "./chat";
import { mentionedIds, mentionsOf, renderMentions } from "./mentions";

/** A read this recent means the member is watching the thread. */
export const WATCHING_MS = 15 * 1000;

/** How long the push services keep trying a phone that is off: a day, after which the badge has said it anyway. */
export const CHAT_TTL = 24 * 60 * 60;

/** About how much of the message a banner carries. */
export const PUSH_TEXT = 120;

/** The message just saved, as `postMessage` returns it, with its Group. */
export interface PostedMessage {
  id: number;
  groupId: number;
  /** The author. */
  memberId: number;
  /** As stored, with its mention tokens. */
  text: string;
}

export interface ChatPushSent {
  memberId: number;
  kind: "chat" | "mention";
  /** Devices that took it. */
  sent: number;
}

/** The link every Chat push opens: the device switches to the Group, then opens its Chat. */
export const chatLink = (groupId: number) => `/go?group=${groupId}&to=/chat`;

/** The text on one line, cut at about `max` characters, counted as people count them. */
export function clipText(text: string, max = PUSH_TEXT): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const chars = [...flat];
  return chars.length <= max ? flat : `${chars.slice(0, max - 1).join("").trimEnd()}…`;
}

/** The plain Chat push's body: `3 new messages · Katie: …`, or `Katie: …` for one. */
export function chatBody(unread: number, author: string, text: string): string {
  const line = `${author}: ${text}`;
  return unread > 1 ? `${unread} new messages · ${line}` : line;
}

/**
 * Takes the member's catch-up push for this message: true when nothing has
 * been pushed to them here since they last read the Chat, and the marker now
 * says this message has. Two messages at once cannot both take it.
 */
async function takeCatchUp(db: Db, groupId: number, memberId: number, messageId: number): Promise<boolean> {
  const taken = await db
    .update(memberships)
    .set({ chatPushedId: messageId })
    .where(
      and(
        eq(memberships.groupId, groupId),
        eq(memberships.memberId, memberId),
        or(isNull(memberships.chatPushedId), lte(memberships.chatPushedId, memberships.chatReadId)),
      ),
    )
    .returning({ memberId: memberships.memberId });
  return taken.length > 0;
}

/** A mention is the member's catch-up push too, so the next plain message stays quiet. */
async function markPushed(db: Db, groupId: number, memberId: number, messageId: number): Promise<void> {
  await db
    .update(memberships)
    .set({ chatPushedId: sql`greatest(coalesce(${memberships.chatPushedId}, 0), ${messageId})` })
    .where(and(eq(memberships.groupId, groupId), eq(memberships.memberId, memberId)));
}

/** Sends what the message owes each Member of its Group, and says what went. */
export async function pushChatMessage(db: Db, pusher: Pusher, message: PostedMessage, now: Date = new Date()): Promise<ChatPushSent[]> {
  const { id, groupId } = message;
  const [roster, [group], mentionRows, markers, devices] = await Promise.all([
    mentionable(db, groupId),
    db.select({ name: groups.name }).from(groups).where(eq(groups.id, groupId)),
    db.select({ memberId: chatMentions.memberId }).from(chatMentions).where(eq(chatMentions.messageId, id)),
    db.select({ memberId: memberships.memberId, readAt: memberships.chatReadAt }).from(memberships).where(eq(memberships.groupId, groupId)),
    membersWithDevices(db),
  ]);
  if (!group) return [];
  const names = new Map(roster.map((entry) => [entry.member.id, entry.member.displayName]));
  const author =
    names.get(message.memberId) ??
    (await db.select({ name: members.displayName }).from(members).where(eq(members.id, message.memberId)))[0]?.name ??
    "Someone";
  const text = clipText(renderMentions(message.text, (memberId) => names.get(memberId)));
  const mentioned = new Set(mentionRows.map((row) => row.memberId));
  const byName = new Set(mentionedIds(message.text));
  const everyone = mentionsOf(message.text).includes("everyone");
  const readAt = new Map(markers.map((row) => [row.memberId, row.readAt]));
  const watching = (memberId: number) => {
    const at = readAt.get(memberId);
    return at != null && now.getTime() - at.getTime() < WATCHING_MS;
  };
  const link = chatLink(groupId);

  /** What the member is owed, reserved and claimed; null for nothing. */
  async function owed(memberId: number, setting: string): Promise<{ kind: ChatPushSent["kind"]; payload: PushPayload } | null> {
    if (mentioned.has(memberId)) {
      if (!(await reserve(db, pushKey.mention(id, memberId)))) return null;
      await markPushed(db, groupId, memberId, id);
      const whom = everyone && !byName.has(memberId) ? "everyone" : "you";
      return {
        kind: "mention",
        payload: { title: `${author} mentioned ${whom} in ${group.name}`, body: text, url: link, tag: `mention-${id}` },
      };
    }
    if (setting !== "all") return null;
    if (!(await takeCatchUp(db, groupId, memberId, id))) return null;
    if (!(await reserve(db, pushKey.chat(id, memberId)))) return null;
    const unread = await unreadCount(db, memberId, groupId);
    return { kind: "chat", payload: { title: group.name, body: chatBody(unread, author, text), url: link, tag: `chat-${groupId}` } };
  }

  const recipients = roster
    .map((entry) => entry.member)
    .filter((m) => m.id !== message.memberId && m.notifyChat !== "off" && devices.has(m.id) && !watching(m.id));
  const sent = await Promise.all(
    recipients.map(async (m): Promise<ChatPushSent | null> => {
      const push = await owed(m.id, m.notifyChat);
      if (!push) return null;
      const delivery = await pushToMember(db, pusher, m.id, push.payload, { ttl: CHAT_TTL }, now);
      return { memberId: m.id, kind: push.kind, sent: delivery.sent };
    }),
  );
  return sent.filter((s) => s !== null);
}
