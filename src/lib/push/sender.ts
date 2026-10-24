/**
 * The seam every push goes through (#454). Callers hold a `Pusher` and never
 * learn which push service is behind it: production signs with the app's VAPID
 * key and sends to Apple's, Google's or Mozilla's, and tests hand in one that
 * records. Push is off across the app while any of the three VAPID settings is
 * unset: nothing sends, and Settings cannot turn it on.
 */
import "server-only";
import webPush from "web-push";

/** One device's subscription, as the push service needs it. */
export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** What the service worker shows: a title, a line under it, and where a tap opens. */
export interface PushPayload {
  title: string;
  body: string;
  /** A path in the app. */
  url: string;
  /** Collapses repeats: a second push with the same tag replaces the first banner. */
  tag: string;
}

/**
 * What one send came to. `gone` is the push service answering 404 or 410: the
 * subscription no longer exists (notifications turned off in phone Settings, or
 * the app deleted), so the caller deletes the row. `failed` is anything else, a
 * timeout or a 5xx, and the row stays for next time.
 */
export type SendOutcome = "sent" | "gone" | "failed";

export interface Pusher {
  /** Never throws. */
  send(target: PushTarget, payload: PushPayload): Promise<SendOutcome>;
}

/** The three VAPID settings; all or nothing. */
export interface PushConfig {
  publicKey: string;
  privateKey: string;
  /** A `mailto:` address or https URL the push services can reach the operator at. */
  subject: string;
}

/**
 * `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` and `WEB_PUSH_SUBJECT`, or null
 * when any is unset. The keys come from `npx web-push generate-vapid-keys`,
 * once; changing them strands every subscription already saved.
 */
export function pushConfigFromEnv(env: Record<string, string | undefined> = process.env): PushConfig | null {
  const publicKey = env.WEB_PUSH_PUBLIC_KEY?.trim();
  const privateKey = env.WEB_PUSH_PRIVATE_KEY?.trim();
  const subject = env.WEB_PUSH_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

/** A Pusher on the real push services, signed with the app's VAPID key. */
export function webPusher(config: PushConfig): Pusher {
  return {
    async send(target, payload) {
      try {
        await webPush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          JSON.stringify(payload),
          {
            vapidDetails: config,
            // A reminder is stale once its Deadline has passed, and the daily run sends it within a day of it.
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

/** The Pusher for this server, or null when push is not configured. */
export function pusherFromEnv(): Pusher | null {
  const config = pushConfigFromEnv();
  return config ? webPusher(config) : null;
}
