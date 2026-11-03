/**
 * One push to one member, on every device they have (#454, #529): the step
 * every kind of push shares once it has decided to send. Callers reserve the
 * push first (`reservations.ts`) and run this inside `after()`, so no request
 * waits on the push services.
 */
import "server-only";
import { eq, inArray } from "drizzle-orm";
import { members, pushSubscriptions } from "@/db/schema";
import type { Db } from "@/db/types";
import type { Pusher, PushPayload, SendOptions, SendOutcome } from "./sender";

export interface Delivery {
  /** Devices that took it. */
  sent: number;
  /** Devices the push service said are gone, now deleted. */
  gone: number;
  /** Devices that failed otherwise, kept for next time. */
  failed: number;
  /** The member's last device went as gone, so Settings says push stopped. */
  stopped: boolean;
}

/**
 * Sends to each of the member's devices. A device the push service answers is
 * gone (404 or 410) is deleted; when that leaves none, `push_stopped_at` is
 * set. A device that failed otherwise keeps its row. A member with no device
 * is sent nothing and is not marked stopped.
 */
export async function pushToMember(
  db: Db,
  pusher: Pusher,
  memberId: number,
  payload: PushPayload,
  options: SendOptions,
  now: Date = new Date(),
): Promise<Delivery> {
  const devices = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.memberId, memberId));
  const outcomes = await Promise.all(
    devices.map(async (d): Promise<[number, SendOutcome]> => [d.id, await pusher.send(d, payload, options)]),
  );
  const gone = outcomes.filter(([, outcome]) => outcome === "gone").map(([id]) => id);
  const sent = outcomes.filter(([, outcome]) => outcome === "sent").length;
  const failed = outcomes.filter(([, outcome]) => outcome === "failed").length;
  if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
  const stopped = devices.length > 0 && gone.length === devices.length;
  if (stopped) await db.update(members).set({ pushStoppedAt: now }).where(eq(members.id, memberId));
  return { sent, gone: gone.length, failed, stopped };
}
