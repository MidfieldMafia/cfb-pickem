/**
 * The browser side of push (#454): whether this device can take the Pick
 * reminder, and the subscribe and unsubscribe steps the Settings switch runs.
 * Push reaches an iPhone only in the Home Screen app (iOS 16.4+), an Android
 * phone in Chrome itself, and never a computer: the reminder is for the phone.
 */
import { isInstalled, readBrowser } from "@/lib/install/install";

export const SERVICE_WORKER_URL = "/sw.js";

/** Why the switch cannot be turned on here; each has its footnote on Settings. */
export type PushBlock = "home_screen" | "computer" | "denied";

export interface DeviceFacts {
  userAgent: string;
  installed: boolean;
  /** The Push API, a service worker and notifications are all there. */
  pushApi: boolean;
  permission: NotificationPermission;
}

/** What stops this device turning the reminder on, or null when nothing does. */
export function pushBlock(device: DeviceFacts): PushBlock | null {
  const { phone } = readBrowser(device.userAgent);
  if (phone === "other") return "computer";
  if ((phone === "ios" && !device.installed) || !device.pushApi) return "home_screen";
  if (device.permission === "denied") return "denied";
  return null;
}

/** This browser's facts, read in the browser only. */
export function deviceFacts(): DeviceFacts {
  const pushApi = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  return {
    userAgent: navigator.userAgent,
    installed: isInstalled(),
    pushApi,
    permission: pushApi ? Notification.permission : "default",
  };
}

function toKey(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export type Subscribed = { ok: true; subscription: PushSubscriptionJSON } | { ok: false; why: "denied" | "failed" };

/**
 * Asks for permission, inside the tap that called it (browsers refuse
 * otherwise, and there is no pre-prompt), then subscribes this device with the
 * app's public key. Don't Allow comes back `denied`.
 */
export async function subscribeDevice(publicKey: string): Promise<Subscribed> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, why: "denied" };
  try {
    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/" });
    await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }));
    return { ok: true, subscription: subscription.toJSON() };
  } catch {
    return { ok: false, why: "failed" };
  }
}

/** Drops this device's subscription in the browser too, so the push service forgets it. Best effort. */
export async function unsubscribeDevice(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker?.getRegistration(SERVICE_WORKER_URL);
    await (await registration?.pushManager.getSubscription())?.unsubscribe();
  } catch {
    // The server has already deleted the row, so nothing more can reach this device.
  }
}

/**
 * Registers the worker again on each launch, so a changed `sw.js` is picked
 * up; only where a subscription may exist, so it never asks for anything.
 */
export async function refreshServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL);
  await registration?.update().catch(() => undefined);
}
