import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { members, pushSubscriptions, type Member, type PushSubscription } from "@/db/schema";
import type { Db } from "@/db/types";
import { Refusal } from "@/lib/refusal";
import type { PushKind, PushPayload, PushPreferences } from "./payload";
import type { PushTarget, Pusher, SendOutcome } from "./sender";

/** The subscription object the browser's `PushManager` hands over, as JSON. */
export interface BrowserSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export class InvalidSubscription extends Refusal {}

const MAX_ENDPOINT = 2048;

function checked(raw: unknown): BrowserSubscription {
  const sub = raw as Partial<BrowserSubscription> | null;
  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : "";
  const p256dh = typeof sub?.keys?.p256dh === "string" ? sub.keys.p256dh : "";
  const auth = typeof sub?.keys?.auth === "string" ? sub.keys.auth : "";
  if (!endpoint.startsWith("https://") || endpoint.length > MAX_ENDPOINT || !p256dh || !auth) {
    throw new InvalidSubscription("That device's subscription is not one the app can use.");
  }
  return { endpoint, keys: { p256dh, auth } };
}

/**
 * Turns notifications on for one of the member's devices. The endpoint is the
 * device's identity: subscribing again from the same device replaces its row
 * (and its keys, which rotate), and a device that changes hands — one endpoint,
 * a different member signed in — moves to the new member.
 */
export async function saveSubscription(
  db: Db,
  member: Pick<Member, "id">,
  raw: unknown,
  preferences: PushPreferences,
  userAgent: string | null,
): Promise<PushSubscription> {
  const sub = checked(raw);
  const [row] = await db
    .insert(pushSubscriptions)
    .values({
      memberId: member.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      ...preferences,
      userAgent: userAgent?.slice(0, 512) ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        memberId: member.id,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        ...preferences,
        userAgent: userAgent?.slice(0, 512) ?? null,
      },
    })
    .returning();
  return row;
}

/** Changes what one of the member's devices is notified about. A device that is not theirs is left alone. */
export async function setPreferences(
  db: Db,
  member: Pick<Member, "id">,
  endpoint: string,
  preferences: PushPreferences,
): Promise<PushSubscription | null> {
  const [row] = await db
    .update(pushSubscriptions)
    .set(preferences)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.memberId, member.id)))
    .returning();
  return row ?? null;
}

/** Turns notifications off for one of the member's devices. */
export async function removeSubscription(db: Db, member: Pick<Member, "id">, endpoint: string): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.memberId, member.id)));
}

/** Every device the member has notifications on for, newest first. */
export async function memberSubscriptions(db: Db, member: Pick<Member, "id">): Promise<PushSubscription[]> {
  return db.query.pushSubscriptions.findMany({
    where: eq(pushSubscriptions.memberId, member.id),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
}

/**
 * The devices to send one kind of notification to, for a set of members:
 * active members only, and only devices that opted into that kind.
 */
export async function subscribedDevices(db: Db, memberIds: number[], kind: PushKind): Promise<PushSubscription[]> {
  if (memberIds.length === 0) return [];
  const rows = await db
    .select({ subscription: pushSubscriptions })
    .from(pushSubscriptions)
    .innerJoin(members, eq(members.id, pushSubscriptions.memberId))
    .where(
      and(inArray(pushSubscriptions.memberId, memberIds), eq(members.active, true), eq(pushSubscriptions[kind], true)),
    );
  return rows.map((r) => r.subscription);
}

/** The devices of every active commissioner that opted into one of the commissioner kinds. */
export async function commissionerDevices(db: Db, kind: PushKind): Promise<PushSubscription[]> {
  const rows = await db
    .select({ subscription: pushSubscriptions })
    .from(pushSubscriptions)
    .innerJoin(members, eq(members.id, pushSubscriptions.memberId))
    .where(and(eq(members.isCommissioner, true), eq(members.active, true), eq(pushSubscriptions[kind], true)));
  return rows.map((r) => r.subscription);
}

export interface Delivery {
  sent: number;
  gone: number;
  failed: number;
}

/**
 * Sends one payload to each device, and drops the rows the push service
 * says are gone. Failures are counted, not thrown: a notification is a
 * courtesy, and the Chat post or the Final it rides on has already landed.
 */
export async function deliver(
  db: Db,
  pusher: Pusher,
  devices: PushSubscription[],
  payloadFor: (device: PushSubscription) => PushPayload,
  now: Date = new Date(),
): Promise<Delivery> {
  const outcomes = await Promise.all(
    devices.map(async (device): Promise<[PushSubscription, SendOutcome]> => {
      const target: PushTarget = {
        endpoint: device.endpoint,
        p256dh: device.p256dh,
        auth: device.auth,
      };
      return [device, await pusher.send(target, payloadFor(device))];
    }),
  );
  const gone = outcomes.filter(([, o]) => o === "gone").map(([d]) => d.id);
  const sent = outcomes.filter(([, o]) => o === "sent").map(([d]) => d.id);
  if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
  if (sent.length) {
    await db.update(pushSubscriptions).set({ lastSentAt: now }).where(inArray(pushSubscriptions.id, sent));
  }
  return {
    sent: sent.length,
    gone: gone.length,
    failed: outcomes.length - sent.length - gone.length,
  };
}
