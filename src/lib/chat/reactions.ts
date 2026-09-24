/**
 * Chat reactions (#177, #249): the four a Member can put on a message, and the
 * rule for what a tap on one does. One reaction per Member per message.
 *
 * Client-safe: no database imports. The schema reads the kinds from here, as it
 * reads `MAX_CHAT_TEXT` from `limits.ts`.
 */

/** In the tray's order, which is also the order of the chips under a message. */
export const chatReactionKinds = ["flag", "hot", "respect", "ha"] as const;
export type ChatReactionKind = (typeof chatReactionKinds)[number];

export const CHAT_REACTION_LABELS: Record<ChatReactionKind, string> = {
  flag: "Flag",
  hot: "Hot take",
  respect: "Respect",
  ha: "Ha",
};

export function isChatReactionKind(value: unknown): value is ChatReactionKind {
  return typeof value === "string" && (chatReactionKinds as readonly string[]).includes(value);
}

/**
 * What the member's reaction becomes when they tap `tapped` while holding
 * `current`: tapping yours again takes it off, tapping another switches to it.
 */
export function tapReaction(current: ChatReactionKind | null, tapped: ChatReactionKind): ChatReactionKind | null {
  return current === tapped ? null : tapped;
}

interface Reacted {
  reactions: { kind: ChatReactionKind; count: number }[];
  mine: ChatReactionKind | null;
}

/**
 * A message's counts as they will be once the viewer's reaction is `next`: the
 * phone shows this the moment it is tapped, before the server answers.
 */
export function withReaction<M extends Reacted>(message: M, next: ChatReactionKind | null): M {
  const counts = new Map(message.reactions.map((r) => [r.kind, r.count]));
  if (message.mine) counts.set(message.mine, (counts.get(message.mine) ?? 0) - 1);
  if (next) counts.set(next, (counts.get(next) ?? 0) + 1);
  const reactions = chatReactionKinds.filter((kind) => (counts.get(kind) ?? 0) > 0).map((kind) => ({ kind, count: counts.get(kind)! }));
  return { ...message, reactions, mine: next };
}
