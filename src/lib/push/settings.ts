/**
 * The Settings card's Notifications (#454, #529). Two things are saved, and
 * they never touch each other:
 *
 * - **Devices**, one `push_subscriptions` row per phone that can take a push.
 *   Only the Notifications switch on that phone adds or deletes its row; the
 *   push service answering that a device is gone deletes it too (`deliver.ts`).
 * - **Settings**, one value per push kind per member on `members`, the same on
 *   every phone. A row on the card saves one kind and never adds or deletes a
 *   device.
 *
 * A push goes to a member only when its kind is on and they have a device.
 */
import "server-only";
import { and, eq } from "drizzle-orm";
import { chatNotifications, members, pushSubscriptions, type ChatNotification, type Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { isCommissioner } from "@/lib/members/members";
import { Refusal } from "@/lib/refusal";

export class InvalidSubscription extends Refusal {}
export class InvalidSetting extends Refusal {}

/** What the member wants pushed, one value per kind. */
export interface NotificationSettings {
  reminder: boolean;
  chat: ChatNotification;
  weeklyWin: boolean;
  closeGames: boolean;
  /** New Feedback; only a commissioner's is read. */
  feedback: boolean;
}

export type NotificationKind = keyof NotificationSettings;

type SettingsColumns = Pick<Member, "notifyReminder" | "notifyChat" | "notifyWeeklyWin" | "notifyCloseGames" | "notifyFeedback">;

/** Each kind's column on `members`. */
const COLUMN = {
  reminder: "notifyReminder",
  chat: "notifyChat",
  weeklyWin: "notifyWeeklyWin",
  closeGames: "notifyCloseGames",
  feedback: "notifyFeedback",
} as const satisfies Record<NotificationKind, keyof SettingsColumns>;

export function notificationSettings(member: SettingsColumns): NotificationSettings {
  return {
    reminder: member.notifyReminder,
    chat: member.notifyChat,
    weeklyWin: member.notifyWeeklyWin,
    closeGames: member.notifyCloseGames,
    feedback: member.notifyFeedback,
  };
}

function settingValue(kind: NotificationKind, value: unknown): boolean | ChatNotification {
  if (kind === "chat") {
    if (typeof value === "string" && (chatNotifications as readonly string[]).includes(value)) return value as ChatNotification;
  } else if (typeof value === "boolean") {
    return value;
  }
  throw new InvalidSetting("That setting can't be saved.");
}

/**
 * One row on the card: saves one kind for the member, on every phone. New
 * Feedback is a commissioner's alone. Devices are left as they are.
 */
export async function saveNotificationSetting(db: Db, member: Member, kind: NotificationKind, value: unknown): Promise<void> {
  if (!Object.hasOwn(COLUMN, kind)) throw new InvalidSetting("That setting can't be saved.");
  if (kind === "feedback" && !isCommissioner(member)) throw new InvalidSetting("New Feedback is for commissioners.");
  await db
    .update(members)
    .set({ [COLUMN[kind]]: settingValue(kind, value) })
    .where(eq(members.id, member.id));
}

/** Whether to say push stopped reaching the member: their last device answered gone, and none has been saved since. */
export function pushStopped(member: Pick<Member, "pushStoppedAt">, devices: number): boolean {
  return devices === 0 && member.pushStoppedAt !== null;
}

/** The member's saved devices, by endpoint: the Settings switch is on where this browser's subscription is one of them. */
export async function savedEndpoints(db: Db, memberId: number): Promise<string[]> {
  const rows = await db
    .select({ endpoint: pushSubscriptions.endpoint })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.memberId, memberId));
  return rows.map((r) => r.endpoint);
}

/** Every member with at least one device: who a push can reach at all. */
export async function membersWithDevices(db: Db): Promise<Set<number>> {
  const rows = await db.selectDistinct({ memberId: pushSubscriptions.memberId }).from(pushSubscriptions);
  return new Set(rows.map((r) => r.memberId));
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

/** Notifications on for this phone: saves its device and clears the note that push had stopped. Settings are left as they are. */
export async function turnOnPush(db: Db, member: Pick<Member, "id">, raw: unknown): Promise<void> {
  const sub = checked(raw);
  await saveDevice(db, member.id, sub);
  await db.update(members).set({ pushStoppedAt: null }).where(eq(members.id, member.id));
}

/** Notifications off for this phone: deletes this device only, and only when it is the member's. */
export async function turnOffPush(db: Db, member: Pick<Member, "id">, endpoint: unknown): Promise<void> {
  if (typeof endpoint !== "string" || !endpoint) return;
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.memberId, member.id)));
}

/**
 * The service worker's `pushsubscriptionchange`: the push service rotated a
 * device's subscription, so the new one takes the place of `replaces`. Saved
 * only when `replaces` is still one of this member's devices, so a device
 * turned off, or deleted as gone, is not brought back. True when it was saved.
 */
export async function rotateSubscription(
  db: Db,
  member: Pick<Member, "id">,
  raw: unknown,
  replaces: string | null,
): Promise<boolean> {
  const sub = checked(raw);
  if (!replaces) return false;
  const replaced = await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, replaces), eq(pushSubscriptions.memberId, member.id)))
    .returning({ id: pushSubscriptions.id });
  if (replaced.length === 0) return false;
  await saveDevice(db, member.id, sub);
  return true;
}
