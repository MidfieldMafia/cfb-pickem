/**
 * The Settings switch for the Pick reminder by push (#454). The setting is the
 * member's (`members.reminder_channel`); each device that can take a push is a
 * `push_subscriptions` row. On saves Push and the device it was turned on from;
 * off deletes every device the member has, so a reminder never reaches a phone
 * the member turned it off on.
 */
import "server-only";
import { and, eq } from "drizzle-orm";
import { members, pushSubscriptions, type Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { Refusal } from "@/lib/refusal";

export class InvalidSubscription extends Refusal {}

/** What the switch shows: on only for Push, and whether push stopped reaching the member while it was. */
export function reminderSwitch(member: Pick<Member, "reminderChannel" | "pushStoppedAt">): { on: boolean; stopped: boolean } {
  const on = member.reminderChannel === "push";
  return { on, stopped: !on && member.pushStoppedAt !== null };
}

/** The subscription a browser's `PushManager` hands over, as `toJSON()` gives it. */
export interface BrowserSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

const MAX_ENDPOINT = 2048;
const MAX_KEY = 256;

function checked(raw: unknown): BrowserSubscription {
  const sub = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : "";
  const p256dh = typeof sub?.keys?.p256dh === "string" ? sub.keys.p256dh : "";
  const auth = typeof sub?.keys?.auth === "string" ? sub.keys.auth : "";
  const usable = endpoint.startsWith("https://") && endpoint.length <= MAX_ENDPOINT;
  const keyed = p256dh && auth && p256dh.length <= MAX_KEY && auth.length <= MAX_KEY;
  if (!usable || !keyed) {
    throw new InvalidSubscription("This device's notifications aren't ones the app can send to.");
  }
  return { endpoint, keys: { p256dh, auth } };
}

/**
 * Upserts on the endpoint, which is the device: subscribing again replaces its
 * keys, and a device that changes hands moves to the member signed in now.
 */
async function saveDevice(db: Db, memberId: number, sub: BrowserSubscription): Promise<void> {
  const values = { memberId, p256dh: sub.keys.p256dh, auth: sub.keys.auth };
  await db
    .insert(pushSubscriptions)
    .values({ ...values, endpoint: sub.endpoint })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values });
}

/** Turns the reminder on from this device: saves it and Push, and clears the note that push had stopped. */
export async function turnOnPush(db: Db, member: Pick<Member, "id">, raw: unknown): Promise<void> {
  const sub = checked(raw);
  await saveDevice(db, member.id, sub);
  await db.update(members).set({ reminderChannel: "push", pushStoppedAt: null }).where(eq(members.id, member.id));
}

/** Turns the reminder off: every device the member has is deleted. */
export async function turnOffPush(db: Db, member: Pick<Member, "id">): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.memberId, member.id));
  await db.update(members).set({ reminderChannel: "off", pushStoppedAt: null }).where(eq(members.id, member.id));
}

/**
 * The service worker's `pushsubscriptionchange`: the push service rotated a
 * device's subscription, so the new one replaces `replaces`. Saved only while
 * the member's reminder is on, so a device the member turned it off on is
 * not brought back. True when it was saved.
 */
export async function rotateSubscription(
  db: Db,
  member: Pick<Member, "id" | "reminderChannel">,
  raw: unknown,
  replaces: string | null,
): Promise<boolean> {
  if (member.reminderChannel !== "push") return false;
  const sub = checked(raw);
  if (replaces) {
    await db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, replaces), eq(pushSubscriptions.memberId, member.id)));
  }
  await saveDevice(db, member.id, sub);
  return true;
}
