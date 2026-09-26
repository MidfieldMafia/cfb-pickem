import "server-only";
import webPush from "web-push";
import type { PushPayload } from "./payload";

/** One device's subscription, as the push service needs it. */
export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * What one send came to. `gone` is the push service saying the subscription
 * no longer exists (the member turned notifications off in the OS, or
 * reinstalled the app): the caller deletes the row. `failed` is anything else
 * — a timeout, a 5xx — and the row stays for next time.
 */
export type SendOutcome = "sent" | "gone" | "failed";

/** The seam the notifiers send through; tests hand in one that records. */
export interface Pusher {
  send(target: PushTarget, payload: PushPayload): Promise<SendOutcome>;
}

/** The three VAPID settings; all or nothing. */
export interface PushConfig {
  publicKey: string;
  privateKey: string;
  /** `mailto:` address or https URL the push services can reach the operator at. */
  subject: string;
}

/**
 * Reads the VAPID settings from the environment, or null when any is unset —
 * push is then off across the app: nothing sends, and the Notifications page
 * says so. The keys come from `npx web-push generate-vapid-keys`, once.
 */
export function pushConfigFromEnv(env: Record<string, string | undefined> = process.env): PushConfig | null {
  const publicKey = env.WEB_PUSH_PUBLIC_KEY?.trim();
  const privateKey = env.WEB_PUSH_PRIVATE_KEY?.trim();
  const subject = env.WEB_PUSH_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

/** A Pusher on the real push services (Apple's, Google's, Mozilla's), signed with the app's VAPID key. */
export function webPusher(config: PushConfig): Pusher {
  return {
    async send(target, payload) {
      try {
        await webPush.sendNotification(
          {
            endpoint: target.endpoint,
            keys: { p256dh: target.p256dh, auth: target.auth },
          },
          JSON.stringify(payload),
          {
            vapidDetails: {
              subject: config.subject,
              publicKey: config.publicKey,
              privateKey: config.privateKey,
            },
            // A Chat message or a Final is stale after a day; the service drops it rather than delivering it Tuesday.
            TTL: 24 * 60 * 60,
            urgency: "high",
            timeout: 10_000,
          },
        );
        return "sent";
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) return "gone";
        console.warn(`Push failed for ${new URL(target.endpoint).host}:`, status ?? (error as Error).message);
        return "failed";
      }
    },
  };
}

let cached: Pusher | null | undefined;

/** The process-wide Pusher, or null when push is not configured. */
export function pusher(): Pusher | null {
  if (cached === undefined) {
    const config = pushConfigFromEnv();
    cached = config ? webPusher(config) : null;
  }
  return cached;
}
