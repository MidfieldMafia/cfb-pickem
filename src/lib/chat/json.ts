/**
 * What the Chat screen holds, as it crosses the wire. Client-safe: the thread
 * component and its poll read these, the server builds them.
 */
import type { MemberJson } from "@/lib/slate/json";
import type { Thread } from "./chat";

export interface ChatMessageJson {
  id: number;
  memberId: number;
  text: string;
  /** ISO 8601. */
  createdAt: string;
}

export interface ChatStateJson {
  /** Oldest first. */
  messages: ChatMessageJson[];
  senders: MemberJson[];
  /** The server's clock, ISO 8601: what "today" means for the times over each run. */
  serverNow: string;
}

export function toChatStateJson(thread: Thread, now: Date): ChatStateJson {
  return {
    messages: thread.messages.map((m) => ({ id: m.id, memberId: m.memberId, text: m.text, createdAt: m.createdAt.toISOString() })),
    senders: thread.senders,
    serverNow: now.toISOString(),
  };
}

/** What the badge's poll answers. */
export interface ChatUnreadJson {
  unread: number;
}
