"use client";

import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { MessageCircle, Send, Trash } from "lucide-react";
import {
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@saturday-slate/design-system";
import { Pennant } from "@/components/pennant";
import { GONE_LABELS, type ChatMessageJson, type ChatStateJson, type MentionPersonJson } from "@/lib/chat/json";
import { MAX_CHAT_TEXT } from "@/lib/chat/limits";
import {
  editDraft,
  encodeDraft,
  matchMentions,
  mentionsYou,
  pickerQuery,
  pickMention,
  unreadMentions,
  type Draft,
  type MentionCandidate,
  type MentionMatch,
} from "@/lib/chat/mentions";
import { nextChatPollMs } from "@/lib/chat/poll";
import { usePoll } from "@/lib/use-poll";
import { reactionSheet, tapReaction, withReaction, type ChatReactionKind } from "@/lib/chat/reactions";
import { chatTimeLabel, threadRows, type ThreadRow } from "@/lib/chat/thread";
import { plural } from "@/lib/plural";
import type { MemberJson } from "@/lib/slate/json";
import { MENTION_LIST_ID, MentionedYou, MentionPicker, MentionPill, MessageText, mentionOptionId } from "./mentions";
import { ReactionChips, ReactionSheet, ReactionTray } from "./reactions";

const CHAT_PATH = "/api/chat";
const REACTIONS_PATH = "/api/chat/reactions";
const DELETE_PATH = "/api/chat/delete";

/** How close to the foot of the thread still counts as reading the latest: a new message then scrolls into view. */
const NEAR_BOTTOM_PX = 80;

/** The composer's counter shows once this few characters are left. */
const COUNTER_FROM = 20;

/**
 * The thread as the server last answered it, kept fresh by polling the Live
 * Board's way: the ETag of what the phone holds rides on every request, so an
 * unchanged thread costs a 304; a hidden tab does not poll, and coming back
 * polls at once. The cadence slows once the thread has been quiet a while
 * (`nextChatPollMs`), and speeds up again the moment something moves.
 *
 * `gone` is set when the server says the member is no longer in the Group: the
 * poll stops, and the composer says why.
 */
function useChatState(initial: ChatStateJson, groupId: number) {
  const [gone, setGone] = useState<string | null>(null);
  const { held: state, hold } = usePoll(gone ? null : `${CHAT_PATH}?group=${groupId}`, {
    initial,
    cadence: (_held, quietForMs) => nextChatPollMs(quietForMs),
    onFailed: ({ status, error }) => {
      if (status === 403) setGone(error ?? "You are no longer in this group.");
    },
  });

  /** What a send answered: the thread with the new message in it, which is the freshest state there is. */
  const accept = (next: ChatStateJson, nextEtag: string | null) => hold(next, nextEtag);

  /**
   * Shows a change before the server has it, as a reaction does the moment it
   * is tapped. The ETag is dropped with it, so should the server never take
   * the change, the next poll answers in full and puts the thread right.
   */
  const revise = (change: (message: ChatMessageJson) => ChatMessageJson) =>
    hold((current) => ({ ...current, messages: current.messages.map(change) }), null);

  return { state, gone, setGone, accept, revise };
}

/** Characters as the server counts them: code points, so an emoji is one. */
const length = (text: string) => [...text.trim()].length;

const EMPTY_DRAFT: Draft = { text: "", picked: [] };

/** Where a message sits in the page, for the mention pill to scroll to. */
const messageDomId = (id: number) => `chat-message-${id}`;

/** Whether any of the element shows inside the scrolling box. */
function inView(box: HTMLElement, id: number): boolean {
  const element = document.getElementById(messageDomId(id));
  if (!element) return false;
  const outer = box.getBoundingClientRect();
  const inner = element.getBoundingClientRect();
  return inner.bottom > outer.top && inner.top < outer.bottom;
}

export function ChatThread({
  initial,
  viewer,
  groupId,
  groupName,
  people,
}: {
  initial: ChatStateJson;
  viewer: MemberJson;
  /** The Group this thread is, named on every request so nothing lands in another (`lib/chat/http.ts`). */
  groupId: number;
  groupName: string;
  /** Who the composer can mention: the Group's active Members, the viewer among them. */
  people: MentionPersonJson[];
}) {
  const { state, gone, setGone, accept, revise } = useChatState(initial, groupId);
  /** The message whose reaction tray is open: one at a time. */
  const [trayFor, setTrayFor] = useState<number | null>(null);
  /** The message More is asking about deleting or removing (board 3). */
  const [confirming, setConfirming] = useState<ChatMessageJson | null>(null);
  /** Whose reactions the sheet shows (#338), and on which tab: null for All. Kept after a close until the next opens. */
  const [sheet, setSheet] = useState<{ messageId: number; kind: ChatReactionKind | null; open: boolean } | null>(null);
  const [takingDown, setTakingDown] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  /** Where the caret is in the composer: the picker reads its `@` from here, not the end of the text. */
  const [caret, setCaret] = useState(0);
  /** The `@` the member closed the picker on with Escape: it stays shut until they start another. */
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  /** The picker row the arrow keys are on. */
  const [activeOption, setActiveOption] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const stickToBottom = useRef(true);
  /** The caret to put back once a pick has re-rendered the input's value. */
  const pendingCaret = useRef<number | null>(null);
  /** A scroll we made, not the member: it must not count as reading past a mention. */
  const ownScroll = useRef(false);
  /** The newest message the pill has looked at, so a poll's arrivals are told apart. */
  const newestSeen = useRef(initial.messages.at(-1)?.id ?? 0);
  /**
   * The mentions of the viewer behind the pill, oldest first: those after the
   * marker as it was before this open, and any that arrive by poll while the
   * member is scrolled up. At the foot, an arrival is seen as it lands.
   */
  const [unseen, setUnseen] = useState(() => unreadMentions(initial.messages, viewer.id, initial.readId));

  // Everyone who wrote, reacted or is mentioned, then the Group's Members, for names and pennants.
  const senders = new Map([...people.map((p) => [p.member.id, p.member] as const), ...state.senders.map((s) => [s.id, s] as const)]);
  const query = gone ? null : pickerQuery(draft, caret);
  const candidates: MentionCandidate[] = [
    { target: "everyone", name: "everyone", role: plural(people.length, "Member") },
    ...people.filter((p) => p.member.id !== viewer.id).map((p) => ({ target: p.member.id, name: p.member.displayName, role: p.role })),
  ];
  const matches = query && query.start !== dismissedAt ? matchMentions(query.query, candidates) : [];
  const pickerOpen = matches.length > 0;
  const active = Math.min(activeOption, Math.max(matches.length - 1, 0));
  const byId = new Map(state.messages.map((m) => [m.id, m]));
  const pill = unseen.filter((id) => {
    const message = byId.get(id);
    return message !== undefined && mentionsYou(message, viewer.id);
  });
  const now = new Date(state.serverNow);
  const rows = threadRows(state.messages, viewer.id);
  const sheetMessage = sheet ? state.messages.find((m) => m.id === sheet.messageId) : undefined;
  const sheetView = sheetMessage && sheet ? reactionSheet(sheetMessage, sheet.kind) : null;
  // The sheet follows the poll: a tab that drops to zero falls back to All for
  // good, and a message left with no reactions, or gone, closes it for good.
  // React's "adjust state while rendering": it settles in one extra render,
  // where an effect would first paint the stale tab.
  if (sheet && sheetView?.selected !== sheet.kind) setSheet(sheetView ? { ...sheet, kind: sheetView.selected } : null);
  const used = length(draft.text);
  const over = used > MAX_CHAT_TEXT;
  const left = MAX_CHAT_TEXT - used;

  // Opens at the latest message, and follows new ones in only while the member
  // is already reading the latest: scrolled up into history, the thread stays put.
  // A mention of the viewer that lands while they are scrolled up joins the pill.
  useLayoutEffect(() => {
    const box = scroller.current;
    const arrived = state.messages.filter((m) => m.id > newestSeen.current);
    newestSeen.current = Math.max(newestSeen.current, state.messages.at(-1)?.id ?? 0);
    if (!stickToBottom.current) {
      const mentions = arrived.filter((m) => mentionsYou(m, viewer.id)).map((m) => m.id);
      // Syncing the pill with what the poll just brought in, before paint.
      if (mentions.length > 0) setUnseen((ids) => [...ids, ...mentions]);
    }
    if (box && stickToBottom.current) {
      ownScroll.current = true;
      box.scrollTop = box.scrollHeight;
    }
  }, [state.messages, viewer.id]);

  // After a pick, the caret goes after the inserted name and its space.
  useLayoutEffect(() => {
    if (pendingCaret.current === null || !input.current) return;
    input.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  });

  const onScroll = () => {
    const box = scroller.current;
    if (!box) return;
    stickToBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < NEAR_BOTTOM_PX;
    if (ownScroll.current) {
      ownScroll.current = false;
      return;
    }
    // Scrolling past a mention by hand sees it.
    if (unseen.some((id) => inView(box, id))) setUnseen((ids) => ids.filter((id) => !inView(box, id)));
  };

  /** The pill's tap: the oldest unseen mention to the centre, and the pill away. */
  const jumpToMention = () => {
    const [oldest] = pill;
    if (oldest !== undefined) document.getElementById(messageDomId(oldest))?.scrollIntoView({ block: "center", behavior: "smooth" });
    setUnseen([]);
  };

  const onDraft = (text: string, at: number) => {
    const next = editDraft(draft, text);
    setDraft(next);
    setCaret(at);
    setActiveOption(0);
    if (pickerQuery(next, at) === null) setDismissedAt(null);
  };

  /** A row of the picker: the name goes in, the input keeps focus, so the iOS keyboard stays up. */
  const pick = (match: MentionMatch) => {
    if (!query) return;
    const next = pickMention(draft, query, match);
    setDraft(next.draft);
    setCaret(next.caret);
    pendingCaret.current = next.caret;
    input.current?.focus();
  };

  const onComposerKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!pickerOpen || !query) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setDismissedAt(query.start);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveOption((active + step + matches.length) % matches.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      pick(matches[active]);
    }
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (sending || used === 0 || over || gone) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch(CHAT_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ group: groupId, text: encodeDraft(draft) }),
      });
      if (response.ok) {
        stickToBottom.current = true;
        accept((await response.json()) as ChatStateJson, response.headers.get("etag"));
        setDraft(EMPTY_DRAFT);
        setCaret(0);
      } else {
        const { error: sentence } = (await response.json().catch(() => ({ error: null }))) as { error: string | null };
        if (response.status === 403 && sentence) setGone(sentence);
        else setError(sentence ?? "That did not send. Try again.");
      }
    } catch {
      setError("That did not send. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  /** A tap in the tray, or on a chip: the counts move at once, and the server's answer is the thread with them in. */
  const react = async (message: ChatMessageJson, tapped: ChatReactionKind) => {
    if (gone) return;
    const kind = tapReaction(message.mine, tapped);
    setTrayFor(null);
    setError(null);
    revise((m) => (m.id === message.id ? withReaction(m, viewer.id, kind) : m));
    try {
      const response = await fetch(REACTIONS_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ group: groupId, message: message.id, kind }),
      });
      if (response.ok) {
        accept((await response.json()) as ChatStateJson, response.headers.get("etag"));
      } else {
        const { error: sentence } = (await response.json().catch(() => ({ error: null }))) as { error: string | null };
        if (response.status === 403 && sentence) setGone(sentence);
        else setError(sentence ?? "That reaction did not save. Try again.");
      }
    } catch {
      setError("That reaction did not save. Check your connection and try again.");
    }
  };

  /** Delete or Remove, confirmed: the server's answer is the thread with the placeholder in. */
  const takeDown = async (message: ChatMessageJson) => {
    if (gone || takingDown) return;
    setTakingDown(true);
    setError(null);
    try {
      const response = await fetch(DELETE_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ group: groupId, message: message.id }),
      });
      if (response.ok) {
        accept((await response.json()) as ChatStateJson, response.headers.get("etag"));
      } else {
        const { error: sentence } = (await response.json().catch(() => ({ error: null }))) as { error: string | null };
        if (response.status === 403 && sentence) setGone(sentence);
        else setError(sentence ?? "That did not go through. Try again.");
      }
    } catch {
      setError("That did not go through. Check your connection and try again.");
    } finally {
      setTakingDown(false);
      setConfirming(null);
    }
  };

  return (
    <>
      {/* The thread, with the mention pill floating over its foot. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* `relative` so the sr-only names, which are absolutely positioned, scroll inside this box rather than stretching the page. */}
        <div ref={scroller} onScroll={onScroll} className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          {rows.length === 0 ? (
            <Empty groupName={groupName} />
          ) : (
            <ol role="log" aria-label="Messages" className="mt-auto flex flex-col gap-1 px-4 py-3">
              {rows.map((row) => (
                <Message
                  key={row.message.id}
                  row={row}
                  people={senders}
                  mentionsYou={mentionsYou(row.message, viewer.id)}
                  sender={senders.get(row.message.memberId)}
                  now={now}
                  trayOpen={trayFor === row.message.id}
                  onTray={
                    gone || row.message.gone || (row.mine && !canTakeDown(row, state.canRemove))
                      ? undefined
                      : () => setTrayFor((open) => (open === row.message.id ? null : row.message.id))
                  }
                  canReact={!gone && !row.mine}
                  onReact={(kind) => void react(row.message, kind)}
                  onShow={(kind) => {
                    setTrayFor(null);
                    setSheet({ messageId: row.message.id, kind, open: true });
                  }}
                  onMore={
                    canTakeDown(row, state.canRemove)
                      ? () => {
                          setTrayFor(null);
                          setConfirming(row.message);
                        }
                      : undefined
                  }
                />
              ))}
            </ol>
          )}
        </div>
        {pill.length > 0 ? <MentionPill count={pill.length} onJump={jumpToMention} /> : null}
      </div>

      {pickerOpen ? <MentionPicker matches={matches} active={active} people={senders} onPick={pick} /> : null}

      <form onSubmit={send} className="border-t border-border bg-background px-4 py-2">
        {gone || error ? (
          <p role="alert" className="pb-2 text-sm text-destructive">
            {gone ?? error}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <label htmlFor="chat-message" className="sr-only">
            Message
          </label>
          <input
            ref={input}
            id="chat-message"
            type="text"
            autoComplete="off"
            enterKeyHint="send"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={pickerOpen}
            aria-controls={MENTION_LIST_ID}
            aria-activedescendant={pickerOpen ? mentionOptionId(active) : undefined}
            value={draft.text}
            onChange={(e) => onDraft(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? e.currentTarget.value.length)}
            onKeyDown={onComposerKey}
            disabled={gone !== null}
            placeholder={`Message ${groupName}`}
            aria-invalid={over || undefined}
            aria-describedby={left <= COUNTER_FROM ? "chat-message-left" : undefined}
            className="h-11 min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive disabled:opacity-50"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={sending || used === 0 || over || gone !== null}
            className="grid size-11 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
          >
            <Send size={18} aria-hidden />
          </button>
        </div>
        {left <= COUNTER_FROM ? (
          <p id="chat-message-left" className={`pt-1 text-right text-xs tabular-nums ${over ? "text-destructive" : "text-muted-foreground"}`}>
            {over ? `${-left} over the ${MAX_CHAT_TEXT}-character limit` : `${left} left`}
          </p>
        ) : null}
      </form>

      <ReactionSheet
        sheet={sheetView}
        open={sheet?.open ?? false}
        people={senders}
        viewerId={viewer.id}
        onSelect={(kind) => setSheet((open) => (open ? { ...open, kind } : open))}
        onClose={() => setSheet((open) => (open ? { ...open, open: false } : open))}
      />

      <TakeDownSheet
        message={confirming}
        sender={confirming ? senders.get(confirming.memberId) : undefined}
        people={senders}
        viewerId={viewer.id}
        busy={takingDown}
        onConfirm={(message) => void takeDown(message)}
        onClose={() => setConfirming(null)}
      />
    </>
  );
}

/** More has something in it: Delete on the viewer's own message, Remove on anyone's for an Organizer or Commissioner. */
function canTakeDown(row: ThreadRow, canRemove: boolean): boolean {
  return row.message.gone === null && (row.mine || canRemove);
}

/**
 * One message. Tapping it opens the tray beneath it (board 5): someone else's
 * to react, and More when there is something in it; the viewer's own for More
 * alone, since they take no reaction from themselves. A deleted or removed
 * message is a one-line placeholder in its place, with nothing to tap.
 */
function Message({
  row,
  people,
  mentionsYou,
  sender,
  now,
  trayOpen,
  onTray,
  canReact,
  onReact,
  onShow,
  onMore,
}: {
  row: ThreadRow;
  /** Everyone the thread knows, for the names its mentions show. */
  people: ReadonlyMap<number, MemberJson>;
  /** Someone else's message naming the viewer or everyone: the fill, the edge and MENTIONED YOU. */
  mentionsYou: boolean;
  sender: MemberJson | undefined;
  now: Date;
  trayOpen: boolean;
  /** Undefined when there is nothing to open: once the member is out of the Group, or on a message that is gone. */
  onTray: (() => void) | undefined;
  /** Someone else's message, and the viewer still in the Group: a chip tap reacts. */
  canReact: boolean;
  onReact: (kind: ChatReactionKind) => void;
  /** Opens who reacted, at a reaction's tab or at All for null. */
  onShow: (kind: ChatReactionKind | null) => void;
  /** Undefined when More has nothing in it. */
  onMore: (() => void) | undefined;
}) {
  const { message, mine, tail } = row;
  // A grouped message that mentions the viewer still needs its label, so it gets a head row of its own.
  const head = row.head || mentionsYou;
  const time = chatTimeLabel(message.createdAt, now);
  const name = sender?.displayName ?? "Someone";
  const tray = trayOpen ? (
    <ReactionTray message={message} mine={mine} onPick={onReact} onMore={onMore} onClose={onTray ?? (() => {})} />
  ) : null;

  if (mine) {
    return (
      <li id={messageDomId(message.id)} className={`flex flex-col items-end gap-0.5 ${head ? "pt-2" : ""}`}>
        {head ? <span className="pr-3 text-xs text-muted-foreground">{time}</span> : null}
        <span className="sr-only">You:</span>
        {message.gone ? (
          <Placeholder message={message} />
        ) : (
          <button
            type="button"
            onClick={onTray}
            disabled={!onTray}
            aria-expanded={onTray ? trayOpen : undefined}
            className={`max-w-[270px] rounded-[14px] bg-primary px-3 py-2 text-left text-base leading-[22px] break-words whitespace-pre-wrap text-primary-foreground ${
              trayOpen ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : ""
            }`}
          >
            <MessageText text={message.text} people={people} mine />
          </button>
        )}
        <ReactionChips message={message} mine canReact={canReact} onReact={onReact} onShow={onShow} />
        {tray}
      </li>
    );
  }

  return (
    // The pennant shares a row with the bubble alone, so it stays level with the
    // foot of the run's last bubble; the chips and tray hang below, indented past it.
    <li id={messageDomId(message.id)} className={`flex flex-col gap-0.5 ${head ? "pt-2" : ""}`}>
      {head ? (
        <div className="flex items-baseline gap-1.5 pl-12 text-xs">
          <span className="font-bold">{name}</span>
          <span className="text-muted-foreground">{time}</span>
          {mentionsYou ? <MentionedYou /> : null}
        </div>
      ) : (
        <span className="sr-only">{name}:</span>
      )}
      <div className="flex items-end gap-2">
        <div className="flex w-7 shrink-0" aria-hidden>
          {tail ? <Pennant avatarId={sender?.avatarId ?? null} name={name} size={28} /> : null}
        </div>
        {message.gone ? (
          <Placeholder message={message} />
        ) : (
          <button
            type="button"
            onClick={onTray}
            disabled={!onTray}
            aria-expanded={trayOpen}
            className={`max-w-[270px] min-w-0 rounded-[14px] px-3 py-2 text-left text-base leading-[22px] break-words whitespace-pre-wrap text-foreground ${
              mentionsYou ? "border-[1.5px] bg-accent" : "border bg-card"
            } ${trayOpen ? "border-ring" : mentionsYou ? "border-primary" : "border-settled-border"}`}
          >
            <MessageText text={message.text} people={people} mine={false} />
          </button>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 pl-9">
        <ReactionChips message={message} mine={false} canReact={canReact} onReact={onReact} onShow={onShow} />
        {tray}
      </div>
    </li>
  );
}

/** Where a deleted or removed message was: one line, and no bubble. */
function Placeholder({ message }: { message: ChatMessageJson }) {
  return (
    <p className="m-0 rounded-[14px] border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground italic">
      {message.gone ? GONE_LABELS[message.gone] : null}
    </p>
  );
}

/**
 * Board 3: More's question before a message goes. Delete for the viewer's
 * own; Remove, under the power that allows it, for anyone else's. The sheet
 * does not know which power that is, only that the server allowed it, so it
 * names neither: the placeholder the thread keeps says who did it.
 */
function TakeDownSheet({
  message,
  sender,
  people,
  viewerId,
  busy,
  onConfirm,
  onClose,
}: {
  message: ChatMessageJson | null;
  sender: MemberJson | undefined;
  people: ReadonlyMap<number, MemberJson>;
  viewerId: number;
  busy: boolean;
  onConfirm: (message: ChatMessageJson) => void;
  onClose: () => void;
}) {
  const own = message?.memberId === viewerId;
  const name = sender?.displayName ?? "Someone";
  return (
    <Drawer open={message !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DrawerContent className="mx-auto max-w-md">
        {message ? (
          <>
            <DrawerHeader>
              <DrawerTitle>{own ? "Delete your message?" : `Remove ${name}'s message?`}</DrawerTitle>
              <DrawerDescription>
                {own
                  ? "It comes out of the chat for everyone. The thread keeps a line saying it was deleted."
                  : "It comes out of the chat for every Member. The thread keeps a line saying who removed it."}
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-4">
              <div className="flex items-center gap-2.5 rounded-md border border-settled-border bg-settled px-3 py-2.5">
                <Pennant avatarId={sender?.avatarId ?? null} name={name} size={20} />
                <span className="min-w-0 text-sm break-words">
                  <MessageText text={message.text} people={people} mine={false} />
                </span>
              </div>
            </div>
          </>
        ) : null}
        <DrawerFooter>
          <Button type="button" variant="destructive" className="h-11" disabled={busy} onClick={() => message && onConfirm(message)}>
            <Trash aria-hidden />
            {own ? "Delete message" : "Remove message"}
          </Button>
          <Button type="button" variant="outline" className="h-11" onClick={onClose}>
            Keep it
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

/** Board 2: nothing said yet. */
function Empty({ groupName }: { groupName: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-10 text-center">
      <div className="grid size-16 place-items-center rounded-full bg-muted text-muted-foreground">
        <MessageCircle size={28} aria-hidden />
      </div>
      <h2 className="m-0 font-display text-[22px] leading-7 font-bold">Nothing said yet</h2>
      <p className="m-0 text-base text-muted-foreground">
        Talk some trash before kickoff, or congratulate whoever called the upset. Everyone in {groupName} sees it.
      </p>
    </div>
  );
}
