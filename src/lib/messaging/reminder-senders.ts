import "server-only";
import { pusherFromEnv } from "@/lib/push/sender";
import type { ReminderSenders } from "./texts";

/** What this server reminds through: the push services when VAPID is set, otherwise nothing. */
export function reminderSendersFromEnv(): ReminderSenders {
  return { push: pusherFromEnv() };
}
