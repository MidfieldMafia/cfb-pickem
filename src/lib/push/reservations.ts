/**
 * Every push is reserved before it is sent (#493, #529): one row in
 * `push_reservations` per push, under a key that names it. The insert is the
 * lock. When the key is already there, another run has sent or is sending that
 * push, and this one sends nothing, so two runs at once cannot double-send.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { pushReservations } from "@/db/schema";
import type { Db } from "@/db/types";

/** One key per push, by what makes it one of a kind. */
export const pushKey = {
  /** A Week's scheduled Pick reminder to one member. */
  reminder: (weekId: number, memberId: number) => `reminder:${weekId}:${memberId}`,
  chat: (messageId: number, memberId: number) => `chat:${messageId}:${memberId}`,
  mention: (messageId: number, memberId: number) => `mention:${messageId}:${memberId}`,
  close: (gameId: number) => `close:${gameId}`,
  win: (weekId: number, groupId: number) => `win:${weekId}:${groupId}`,
  feedback: (feedbackId: number) => `feedback:${feedbackId}`,
};

/** True when this call holds the key and may send; false when it was already taken. */
export async function reserve(db: Db, key: string): Promise<boolean> {
  const rows = await db
    .insert(pushReservations)
    .values({ key })
    .onConflictDoNothing()
    .returning({ key: pushReservations.key });
  return rows.length > 0;
}

/** Gives a key back after a send no device took, so a later run may try it again. */
export async function release(db: Db, key: string): Promise<void> {
  await db.delete(pushReservations).where(eq(pushReservations.key, key));
}
