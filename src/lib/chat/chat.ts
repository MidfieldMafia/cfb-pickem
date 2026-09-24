/**
 * Chat (#177, #248): one thread per Group, holding that Group's messages for the
 * active Season. Only a Member of the Group who is in it now — not removed, not
 * left — reads or writes it; a Commissioner is no exception, since they play
 * only in the groups they are a member of.
 *
 * The unread count behind the tab's badge is counted from a marker on the
 * membership: the id of the newest message the member has seen there.
 */
import "server-only";
import { and, asc, count, desc, eq, gt, inArray, isNull, ne, notExists, or, sql } from "drizzle-orm";
import { chatMessages, membershipRemovals, memberships, members, seasons, type Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { memberGroups } from "@/lib/groups/memberships";
import { Refusal } from "@/lib/refusal";
import { toMemberJson, type MemberJson } from "@/lib/slate/json";
import { MAX_CHAT_TEXT } from "./limits";

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

export interface Thread {
  /** Oldest first. */
  messages: ThreadMessage[];
  /** Everyone who wrote one of `messages`, for the names and pennants. Removed members included. */
  senders: MemberJson[];
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

/**
 * The Group's thread for the active Season, without deleted messages. Empty
 * rather than refused when no Season is active: the screen still has somewhere
 * to land between seasons.
 */
export async function chatThread(db: Db, member: Pick<Member, "id">, groupId: number): Promise<Thread> {
  await requireInGroup(db, member.id, groupId);
  const seasonId = await activeSeasonId(db);
  if (seasonId === null) return { messages: [], senders: [] };
  const newestFirst = await db
    .select({ id: chatMessages.id, memberId: chatMessages.memberId, text: chatMessages.text, createdAt: chatMessages.createdAt })
    .from(chatMessages)
    .where(and(eq(chatMessages.groupId, groupId), eq(chatMessages.seasonId, seasonId), isNull(chatMessages.deletedAt)))
    .orderBy(desc(chatMessages.id))
    .limit(THREAD_LIMIT);
  const messages = newestFirst.reverse();
  const ids = [...new Set(messages.map((m) => m.memberId))];
  const senders =
    ids.length === 0
      ? []
      : (await db.select().from(members).where(inArray(members.id, ids)).orderBy(asc(members.id))).map(toMemberJson);
  return { messages, senders };
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
