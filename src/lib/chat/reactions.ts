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

/** One member's reaction to a message: who reacted, and with what. */
export interface Reactor {
  memberId: number;
  kind: ChatReactionKind;
}

interface Reacted {
  reactions: { kind: ChatReactionKind; count: number }[];
  mine: ChatReactionKind | null;
  /** Newest reaction first. */
  reactors: Reactor[];
}

/**
 * A message's reactions as they will be once the viewer's is `next`: the phone
 * shows this the moment it is tapped, before the server answers. A new or
 * switched reaction is the newest, so the viewer moves to the top of who
 * reacted, as the server will put them.
 */
export function withReaction<M extends Reacted>(message: M, viewerId: number, next: ChatReactionKind | null): M {
  const counts = new Map(message.reactions.map((r) => [r.kind, r.count]));
  if (message.mine) counts.set(message.mine, (counts.get(message.mine) ?? 0) - 1);
  if (next) counts.set(next, (counts.get(next) ?? 0) + 1);
  const reactions = chatReactionKinds.filter((kind) => (counts.get(kind) ?? 0) > 0).map((kind) => ({ kind, count: counts.get(kind)! }));
  const others = message.reactors.filter((r) => r.memberId !== viewerId);
  const reactors = next ? [{ memberId: viewerId, kind: next }, ...others] : others;
  return { ...message, reactions, mine: next, reactors };
}

/** A tab of the sheet: All when `kind` is null. */
export interface ReactionTab {
  kind: ChatReactionKind | null;
  count: number;
}

/** What the sheet of who reacted shows. */
export interface ReactionSheetView {
  tabs: ReactionTab[];
  /** The tab showing: null for All. */
  selected: ChatReactionKind | null;
  /** The people on that tab, newest first. */
  reactors: Reactor[];
}

/**
 * The sheet of who reacted to a message (#338), on the tab `selected` (null
 * for All): All, then a tab per reaction anyone has, in the tray's order, and
 * the people on the tab showing, newest first. A tab whose reaction has since
 * dropped to zero falls back to All; with no reactions left, or the message
 * gone, there is no sheet, and null says to close it.
 */
export function reactionSheet(
  message: Pick<Reacted, "reactions" | "reactors"> & { gone: unknown },
  selected: ChatReactionKind | null,
): ReactionSheetView | null {
  if (message.gone || message.reactors.length === 0) return null;
  const tabs: ReactionTab[] = [{ kind: null, count: message.reactors.length }, ...message.reactions];
  const shown = tabs.some((tab) => tab.kind === selected) ? selected : null;
  return { tabs, selected: shown, reactors: shown ? message.reactors.filter((r) => r.kind === shown) : message.reactors };
}
