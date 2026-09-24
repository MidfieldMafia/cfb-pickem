/**
 * What the Chat screen holds, as it crosses the wire. Client-safe: the thread
 * component and its poll read these, the server builds them.
 */
import type { MemberJson } from "@/lib/slate/json";
import type { GoneReason, ReactionCount, Thread } from "./chat";
import type { ChatReactionKind } from "./reactions";

export interface ChatMessageJson {
  id: number;
  memberId: number;
  /** Empty once the message is gone. */
  text: string;
  /** ISO 8601. */
  createdAt: string;
  /** Each kind anyone has reacted with, in the tray's order; none at zero. */
  reactions: ReactionCount[];
  /** The viewer's own reaction. */
  mine: ChatReactionKind | null;
  /** Why it no longer shows, for the placeholder in its place; null while it does. */
  gone: GoneReason | null;
}

export interface ChatStateJson {
  /** Oldest first. */
  messages: ChatMessageJson[];
  senders: MemberJson[];
  /** The viewer may remove other people's messages: an Organizer of the Group, or a Commissioner. */
  canRemove: boolean;
  /** The server's clock, ISO 8601: what "today" means for the times over each run. */
  serverNow: string;
}

export function toChatStateJson(thread: Thread, now: Date): ChatStateJson {
  return {
    messages: thread.messages.map((m) => ({
      id: m.id,
      memberId: m.memberId,
      text: m.text,
      createdAt: m.createdAt.toISOString(),
      reactions: m.reactions,
      mine: m.mine,
      gone: m.gone,
    })),
    senders: thread.senders,
    canRemove: thread.canRemove,
    serverNow: now.toISOString(),
  };
}

/** What the badge's poll answers. */
export interface ChatUnreadJson {
  unread: number;
}

/** The placeholder a gone message leaves in the thread. */
export const GONE_LABELS: Record<GoneReason, string> = {
  deleted: "Deleted",
  organizer: "Removed by an Organizer",
  commissioner: "Removed by a Commissioner",
};
