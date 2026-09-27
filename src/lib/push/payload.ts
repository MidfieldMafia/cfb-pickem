/**
 * What a push carries to the device. The service worker (`public/sw.js`)
 * shows it as-is: `title` and `body` on the banner, `url` is where a tap
 * lands, `tag` collapses repeats (a second message in the same Group replaces
 * the first banner rather than stacking), and `badge` is the number the app
 * icon shows — the member's unread Chat, or null to leave it alone.
 */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  badge: number | null;
}

/** The kinds of notification a device can opt in to, by column name. `feedback`, `review` and `rollCall` reach commissioners only. */
export type PushKind = "chat" | "finals" | "close" | "feedback" | "review" | "rollCall";

/** The switches as a device stores them, one per kind. */
export type PushPreferences = Record<PushKind, boolean>;

export const PUSH_KINDS: readonly PushKind[] = ["chat", "finals", "close", "feedback", "review", "rollCall"];
/** The kinds only a commissioner is sent, and only a commissioner is shown. */
export const COMMISSIONER_KINDS: readonly PushKind[] = ["feedback", "review", "rollCall"];
