/**
 * Chat keeps one Season (#177, #251). Once the next Season is active, every
 * Group's messages from earlier ones are deleted, not archived: the rows go,
 * deleted and removed ones with them, and so do their reactions. Nobody can
 * read them afterwards.
 */
import "server-only";
import { and, eq, inArray, isNotNull, ne, notExists } from "drizzle-orm";
import { inOneBatch } from "@/db/batch";
import { chatMessages, chatReactions, memberships, seasons } from "@/db/schema";
import type { Db } from "@/db/types";

/**
 * Deletes every Chat message outside the active Season, with its reactions,
 * and clears each unread marker that pointed at one, so every Group starts
 * the Season on an empty thread. Does nothing without an active Season, and
 * nothing on a second run.
 */
export async function clearPastSeasons(db: Db): Promise<void> {
  const [season] = await db.select({ id: seasons.id }).from(seasons).where(eq(seasons.active, true)).limit(1);
  if (!season) return;
  const past = ne(chatMessages.seasonId, season.id);
  await inOneBatch(db, (tx) => [
    tx.delete(chatReactions).where(inArray(chatReactions.messageId, tx.select({ id: chatMessages.id }).from(chatMessages).where(past))),
    tx.delete(chatMessages).where(past),
    // A cleared marker counts from the member's join, as for one who never
    // opened the thread; every message left is this Season's, so that is all
    // of them. A marker already on this Season's messages is left alone.
    tx
      .update(memberships)
      .set({ chatReadId: null })
      .where(
        and(
          isNotNull(memberships.chatReadId),
          notExists(tx.select({ id: chatMessages.id }).from(chatMessages).where(eq(chatMessages.id, memberships.chatReadId))),
        ),
      ),
  ]);
}
