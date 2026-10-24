import "server-only";
import { pusherFromEnv } from "@/lib/push/sender";
import { TEXTING_PAUSED } from "./paused";
import { senderFromEnv } from "./sender";
import type { ReminderSenders } from "./texts";

/** What this server reminds through: Pingram or nothing for texts, the push services when VAPID is set, and the pause. */
export function reminderSendersFromEnv(): ReminderSenders {
  return { sms: senderFromEnv(), push: pusherFromEnv(), textingPaused: TEXTING_PAUSED };
}
