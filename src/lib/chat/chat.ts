/**
 * Chat (#177, #248): one thread per Group, holding that Group's messages for the
 * active Season. Only a Member of the Group who is in it now — not removed, not
 * left — reads or writes it; a Commissioner is no exception, since they play
 * only in the groups they are a member of.
 *
 * The unread count behind the tab's badge is counted from a marker on the
 * membership: the id of the newest message the member has seen there.
 *
 * Reactions (#249) ride on the thread: each message carries its counts and the
 * reader's own, so the poll that brings new messages brings new reactions too.
 *
 * Nobody edits a message (#250). Its sender deletes it; an Organizer of the
 * Group or a Commissioner removes anyone's. Either way the row stays, with
 * `deletedAt` set and, for a removal, `removedBy`, and the thread keeps a
 * one-line placeholder where it was without serving its text.
 */
import "server-only";
import { and, asc, count, desc, eq, gt, inArray, isNull, ne, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { chatMessages, chatReactions, membershipRemovals, memberships, members, seasons, type Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { manageGroup, NotOrganizer } from "@/lib/groups/manage";
import { memberGroups } from "@/lib/groups/memberships";
import { Refusal } from "@/lib/refusal";
import { toMemberJson, type MemberJson } from "@/lib/slate/json";
import { MAX_CHAT_TEXT } from "./limits";
import { chatReactionKinds, type ChatReactionKind } from "./reactions";

export class InvalidChat extends Refusal {}

/** Not a Member of the Group now. A refusal, because a phone left open on the thread can meet it after a removal. */
export class NotInGroup extends InvalidChat {
  constructor() {
    super("You are not in this group any more.");
  }
}

/**
 * The newest messages a thread carries. A season of one family's chat is far
 * below it; the cap only keeps one unusually busy Group from making every poll
 * of its thread heavier for the rest of the year.
 */
export const THREAD_LIMIT = 500;

export interface ThreadMessage {
  id: number;
  memberId: number;
  text: string;
  createdAt: Date;
}

export interface ReactionCount {
  kind: ChatReactionKind;
  count: number;
}

/**
 * Why a message is no longer shown: its sender deleted it, or someone removed
 * it, named by the power they used. A Commissioner who also organizes the
 * Group removes as a Commissioner, as they manage it as one.
 */
export type GoneReason = "deleted" | "organizer" | "commissioner";

export interface ThreadEntry extends ThreadMessage {
  /** Null while it shows. Once gone, `text` is empty and `reactions` none. */
  gone: GoneReason | null;
  /** Each kind anyone has reacted with, in the tray's order; none at zero. */
  reactions: ReactionCount[];
  /** The reader's own reaction. */
  mine: ChatReactionKind | null;
}

export interface Thread {
  /** Oldest first. */
  messages: ThreadEntry[];
  /** Everyone who wrote one of `messages`, for the names and pennants. Removed members included. */
  senders: MemberJson[];
  /** The reader may remove other people's messages here (`canRemoveIn`). */
  canRemove: boolean;
}

async function activeSeasonId(db: Db): Promise<number | null> {
  const [season] = await db.select({ id: seasons.id }).from(seasons).where(eq(seasons.active, true)).limit(1);
  return season?.id ?? null;
}

async function requireInGroup(db: Db, memberId: number, groupId: number): Promise<void> {
  const groups = await memberGroups(db, memberId);
  if (!groups.some((entry) => entry.group.id === groupId)) throw new NotInGroup();
}

/**
 * The text as it will be kept: trimmed, then held to 1 to `MAX_CHAT_TEXT`
 * characters. Counted in code points, as Postgres' `char_length` counts them,
 * so an emoji is one character on both sides of the check.
 */
export function cleanChatText(raw: string): string {
  const text = raw.trim();
  if (text === "") throw new InvalidChat("Say something first.");
  if ([...text].length > MAX_CHAT_TEXT) throw new InvalidChat(`A message is at most ${MAX_CHAT_TEXT} characters.`);
  return text;
}

/** Posts one message to the Group's thread for the active Season. */
export async function postMessage(db: Db, member: Member, groupId: number, raw: string, now: Date = new Date()): Promise<ThreadMessage> {
  const text = cleanChatText(raw);
  await requireInGroup(db, member.id, groupId);
  const seasonId = await activeSeasonId(db);
  if (seasonId === null) throw new InvalidChat("Chat opens when the season does.");
  const [row] = await db
    .insert(chatMessages)
    .values({ groupId, memberId: member.id, seasonId, text, createdAt: now })
    .returning({ id: chatMessages.id, memberId: chatMessages.memberId, text: chatMessages.text, createdAt: chatMessages.createdAt });
  return row;
}

/** Whoever removed a message, beside the message's sender. */
const remover = alias(members, "remover");

/**
 * The Group's thread for the active Season. A deleted or removed message keeps
 * its place with its text left out, so the thread can say it was there. Empty
 * rather than refused when no Season is active: the screen still has somewhere
 * to land between seasons.
 */
export async function chatThread(db: Db, member: Member, groupId: number): Promise<Thread> {
  await requireInGroup(db, member.id, groupId);
  const seasonId = await activeSeasonId(db);
  if (seasonId === null) return { messages: [], senders: [], canRemove: false };
  const newestFirst = await db
    .select({
      id: chatMessages.id,
      memberId: chatMessages.memberId,
      text: chatMessages.text,
      createdAt: chatMessages.createdAt,
      deletedAt: chatMessages.deletedAt,
      removedBy: chatMessages.removedBy,
      removerIsCommissioner: remover.isCommissioner,
    })
    .from(chatMessages)
    .leftJoin(remover, eq(remover.id, chatMessages.removedBy))
    .where(and(eq(chatMessages.groupId, groupId), eq(chatMessages.seasonId, seasonId)))
    .orderBy(desc(chatMessages.id))
    .limit(THREAD_LIMIT);
  const shown = newestFirst.filter((m) => m.deletedAt === null).map((m) => m.id);
  const reactions = await reactionsTo(db, member.id, shown);
  const messages: ThreadEntry[] = newestFirst.reverse().map((m) => {
    const base = { id: m.id, memberId: m.memberId, createdAt: m.createdAt };
    if (m.deletedAt !== null) {
      const gone: GoneReason = m.removedBy === null ? "deleted" : m.removerIsCommissioner ? "commissioner" : "organizer";
      return { ...base, text: "", gone, reactions: [], mine: null };
    }
    return { ...base, text: m.text, gone: null, ...(reactions.get(m.id) ?? { reactions: [], mine: null }) };
  });
  const ids = [...new Set(messages.map((m) => m.memberId))];
  const senders =
    ids.length === 0
      ? []
      : (await db.select().from(members).where(inArray(members.id, ids)).orderBy(asc(members.id))).map(toMemberJson);
  return { messages, senders, canRemove: await canRemoveIn(db, member, groupId) };
}

/**
 * Whether the member may remove other people's messages in the Group: an
 * Organizer of it in good standing, or a Commissioner. The screen offers
 * Remove on that alone; `takeDown` checks it again.
 */
export async function canRemoveIn(db: Db, member: Member, groupId: number): Promise<boolean> {
  try {
    await manageGroup(db, member, groupId);
    return true;
  } catch (error) {
    if (error instanceof NotOrganizer) return false;
    throw error;
  }
}

/**
 * Takes a message out of the Group's thread: deletes it when it is the
 * member's own, removes it when it is someone else's and they may
 * (`canRemoveIn`). Only a message still showing in the active Season's thread
 * can go; one already gone is refused, so the first of two taps wins and its
 * placeholder stands.
 */
export async function takeDown(db: Db, member: Member, groupId: number, messageId: number, now: Date = new Date()): Promise<void> {
  await requireInGroup(db, member.id, groupId);
  const [message] = await db
    .select({ id: chatMessages.id, memberId: chatMessages.memberId })
    .from(chatMessages)
    .innerJoin(seasons, and(eq(seasons.id, chatMessages.seasonId), eq(seasons.active, true)))
    .where(and(eq(chatMessages.id, messageId), eq(chatMessages.groupId, groupId), isNull(chatMessages.deletedAt)))
    .limit(1);
  if (!message) throw new InvalidChat("That message is gone.");
  const own = message.memberId === member.id;
  if (!own && !(await canRemoveIn(db, member, groupId))) {
    throw new InvalidChat("Only the group's organizers can remove someone else's message.");
  }
  const [taken] = await db
    .update(chatMessages)
    .set(own ? { deletedAt: now } : { deletedAt: now, removedBy: member.id })
    .where(and(eq(chatMessages.id, messageId), isNull(chatMessages.deletedAt)))
    .returning({ id: chatMessages.id });
  if (!taken) throw new InvalidChat("That message is gone.");
}

/** The counts and the reader's own reaction for each of `messageIds` that has any. */
async function reactionsTo(
  db: Db,
  readerId: number,
  messageIds: number[],
): Promise<Map<number, Pick<ThreadEntry, "reactions" | "mine">>> {
  const byMessage = new Map<number, Pick<ThreadEntry, "reactions" | "mine">>();
  if (messageIds.length === 0) return byMessage;
  const rows = await db
    .select({ messageId: chatReactions.messageId, memberId: chatReactions.memberId, kind: chatReactions.kind })
    .from(chatReactions)
    .where(inArray(chatReactions.messageId, messageIds));
  const counts = new Map<number, Map<ChatReactionKind, number>>();
  for (const row of rows) {
    const kinds = counts.get(row.messageId) ?? new Map<ChatReactionKind, number>();
    kinds.set(row.kind, (kinds.get(row.kind) ?? 0) + 1);
    counts.set(row.messageId, kinds);
    if (row.memberId === readerId) byMessage.set(row.messageId, { reactions: [], mine: row.kind });
  }
  for (const [messageId, kinds] of counts) {
    const reactions = chatReactionKinds.filter((kind) => kinds.has(kind)).map((kind) => ({ kind, count: kinds.get(kind)! }));
    byMessage.set(messageId, { reactions, mine: byMessage.get(messageId)?.mine ?? null });
  }
  return byMessage;
}

/**
 * Sets the member's reaction to a message in the Group's thread: `kind` puts
 * it on or switches it, null takes it off. The phone sends the reaction it
 * wants rather than "toggle", so a tap sent twice lands where one would.
 *
 * Only a message still showing in the active Season's thread takes one.
 */
export async function setReaction(
  db: Db,
  member: Pick<Member, "id">,
  groupId: number,
  messageId: number,
  kind: ChatReactionKind | null,
  now: Date = new Date(),
): Promise<void> {
  await requireInGroup(db, member.id, groupId);
  const [message] = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .innerJoin(seasons, and(eq(seasons.id, chatMessages.seasonId), eq(seasons.active, true)))
    .where(and(eq(chatMessages.id, messageId), eq(chatMessages.groupId, groupId), isNull(chatMessages.deletedAt)))
    .limit(1);
  if (!message) throw new InvalidChat("That message is gone.");
  const mine = and(eq(chatReactions.messageId, messageId), eq(chatReactions.memberId, member.id));
  if (kind === null) {
    await db.delete(chatReactions).where(mine);
    return;
  }
  await db
    .insert(chatReactions)
    .values({ messageId, memberId: member.id, kind, createdAt: now })
    .onConflictDoUpdate({ target: [chatReactions.messageId, chatReactions.memberId], set: { kind, createdAt: now } });
}

/**
 * Moves the member's marker in this Group to the newest message of `thread`,
 * the thread they have just been shown. Never backwards: two requests from the
 * same phone can land out of order, and the older must not undo the newer.
 */
export async function markRead(db: Db, memberId: number, groupId: number, thread: Pick<Thread, "messages">): Promise<void> {
  const newest = thread.messages.at(-1);
  if (!newest) return;
  await db
    .update(memberships)
    .set({ chatReadId: newest.id })
    .where(
      and(
        eq(memberships.groupId, groupId),
        eq(memberships.memberId, memberId),
        or(isNull(memberships.chatReadId), sql`${memberships.chatReadId} < ${newest.id}`),
      ),
    );
}

/**
 * How many of the other members' messages in the Group's thread the member has
 * not seen. Zero outside the Group or without an active Season.
 *
 * A member who has never opened the thread counts from the moment they joined
 * the Group rather than from the start of the season, so arriving mid-season
 * does not greet them with the whole year as "new".
 */
export async function unreadCount(db: Db, memberId: number, groupId: number): Promise<number> {
  const stillOut = db
    .select({ id: membershipRemovals.id })
    .from(membershipRemovals)
    .where(
      and(
        eq(membershipRemovals.groupId, groupId),
        eq(membershipRemovals.memberId, memberId),
        isNull(membershipRemovals.restoredAt),
      ),
    );
  const [row] = await db
    .select({ n: count() })
    .from(chatMessages)
    .innerJoin(memberships, and(eq(memberships.groupId, chatMessages.groupId), eq(memberships.memberId, memberId)))
    .innerJoin(seasons, and(eq(seasons.id, chatMessages.seasonId), eq(seasons.active, true)))
    .where(
      and(
        eq(chatMessages.groupId, groupId),
        ne(chatMessages.memberId, memberId),
        isNull(chatMessages.deletedAt),
        notExists(stillOut),
        or(
          and(isNull(memberships.chatReadId), gt(chatMessages.createdAt, memberships.joinedAt)),
          gt(chatMessages.id, memberships.chatReadId),
        ),
      ),
    );
  return row?.n ?? 0;
}
