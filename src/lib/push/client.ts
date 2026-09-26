/**
 * The browser side of push, used by the Notifications screen and the
 * registrar. Everything here is a no-op where the API is missing, so the
 * screens can render before asking.
 */

export const SERVICE_WORKER_URL = "/sw.js";

/** Whether this browser can take Web Push at all (iOS: only once installed to the Home Screen). */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  );
}

/** iPhone or iPad, where push needs the Home Screen install first. */
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
}

/**
 * Registers the service worker, idempotently. The worker has no fetch
 * handler, so registering it changes nothing about how pages load; it only
 * has to exist for the push service to have something to wake.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(SERVICE_WORKER_URL, {
      scope: "/",
    });
  } catch {
    return null;
  }
}

/** The subscription this device already holds, if any. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL);
  return (await registration?.pushManager.getSubscription()) ?? null;
}

function toKey(base64url: string): Uint8Array {
  const padded = base64url
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export type SubscribeOutcome =
  { ok: true; subscription: PushSubscription } | { ok: false; why: "denied" | "unsupported" | "failed" };

/**
 * Asks for permission (this must run from a tap; browsers refuse otherwise)
 * and subscribes this device with the app's public key.
 */
export async function subscribeDevice(publicKey: string): Promise<SubscribeOutcome> {
  if (!pushSupported()) return { ok: false, why: "unsupported" };
  const registration = await registerServiceWorker();
  if (!registration) return { ok: false, why: "unsupported" };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, why: "denied" };
  try {
    await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toKey(publicKey) as BufferSource,
      }));
    return { ok: true, subscription };
  } catch {
    return { ok: false, why: "failed" };
  }
}

/** Clears the number on the app icon; a no-op where badging is unsupported. */
export async function clearAppBadge(): Promise<void> {
  const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
  if (typeof nav.clearAppBadge !== "function") return;
  try {
    await nav.clearAppBadge();
  } catch {
    // Badging is a courtesy; a browser that refuses just keeps the number.
  }
}
