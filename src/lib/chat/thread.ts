/**
 * How the Chat thread lays out (board 1 of the #177 canvas): messages grouped
 * into runs by sender, each run with the sender's name and time at its top and
 * their pennant at its foot, the viewer's own on the other side. Decided here
 * rather than in the component so a test can hold it to the board.
 *
 * Client-safe: no database imports.
 */
import { formatterFor } from "@/lib/intl-time";
import type { ChatMessageJson } from "./json";

/** A pause this long starts a new run even from the same sender, so the run's time stays true. */
export const RUN_BREAK_MS = 10 * 60_000;

/**
 * The app's zone for times on screen, as the console's. A fixed zone rather
 * than the phone's, so the server's render and the phone's agree.
 */
const ZONE = "America/Chicago";

export interface ThreadRow {
  message: ChatMessageJson;
  mine: boolean;
  /** First of its run: the name and time go above it. */
  head: boolean;
  /** Last of its run: the sender's pennant goes beside it. */
  tail: boolean;
}

function continues(prev: ChatMessageJson | undefined, next: ChatMessageJson): boolean {
  if (!prev || prev.memberId !== next.memberId) return false;
  return new Date(next.createdAt).getTime() - new Date(prev.createdAt).getTime() < RUN_BREAK_MS;
}

export function threadRows(messages: readonly ChatMessageJson[], viewerId: number): ThreadRow[] {
  return messages.map((message, i) => ({
    message,
    mine: message.memberId === viewerId,
    head: !continues(messages[i - 1], message),
    tail: !continues(message, messages[i + 1] ?? { ...message, memberId: -1 }),
  }));
}

const day = (at: Date) => formatterFor({ year: "numeric", month: "2-digit", day: "2-digit", timeZone: ZONE }).format(at);
const DAY_MS = 24 * 60 * 60_000;

/** "3:41 PM" today, "Sat 3:41 PM" within the week, "Sep 12, 3:41 PM" before that. */
export function chatTimeLabel(createdAt: string, now: Date): string {
  const at = new Date(createdAt);
  const time = formatterFor({ hour: "numeric", minute: "2-digit", timeZone: ZONE }).format(at);
  if (day(at) === day(now)) return time;
  if (now.getTime() - at.getTime() < 6 * DAY_MS) {
    return `${formatterFor({ weekday: "short", timeZone: ZONE }).format(at)} ${time}`;
  }
  return `${formatterFor({ month: "short", day: "numeric", timeZone: ZONE }).format(at)}, ${time}`;
}
