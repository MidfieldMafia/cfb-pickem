"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { MessageCircle, Send } from "lucide-react";
import { Pennant } from "@/components/pennant";
import type { ChatStateJson } from "@/lib/chat/json";
import { MAX_CHAT_TEXT } from "@/lib/chat/limits";
import { nextChatPollMs } from "@/lib/chat/poll";
import { chatTimeLabel, threadRows, type ThreadRow } from "@/lib/chat/thread";
import type { MemberJson } from "@/lib/slate/json";

const CHAT_PATH = "/api/chat";

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
  const [state, setState] = useState(initial);
  const [gone, setGone] = useState<string | null>(null);
  const etag = useRef<string | null>(null);
  const changedAt = useRef(0);

  useEffect(() => {
    changedAt.current = Date.now();
  }, [state]);

  useEffect(() => {
    if (gone) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      timer = setTimeout(() => void poll(), nextChatPollMs(Date.now() - changedAt.current));
    };
    const poll = async () => {
      clearTimeout(timer);
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch(`${CHAT_PATH}?group=${groupId}`, { cache: "no-store", headers: etag.current ? { "if-none-match": etag.current } : {} });
        if (cancelled) return;
        if (response.status === 403) {
          setGone(((await response.json()) as { error: string }).error);
          return;
        }
        if (response.ok) {
          etag.current = response.headers.get("etag");
          setState((await response.json()) as ChatStateJson);
        }
      } catch {
        // A missed poll is a thread a few seconds behind; the next one catches up.
      }
      if (!cancelled) schedule();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void poll();
    };

    document.addEventListener("visibilitychange", onVisibility);
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [gone, groupId]);

  /** What a send answered: the thread with the new message in it, which is the freshest state there is. */
  const accept = (next: ChatStateJson, nextEtag: string | null) => {
    etag.current = nextEtag;
    setState(next);
  };

  return { state, gone, setGone, accept };
}

/** Characters as the server counts them: code points, so an emoji is one. */
const length = (text: string) => [...text.trim()].length;

export function ChatThread({
  initial,
  viewer,
  groupId,
  groupName,
}: {
  initial: ChatStateJson;
  viewer: MemberJson;
  /** The Group this thread is, named on every request so nothing lands in another (`lib/chat/http.ts`). */
  groupId: number;
  groupName: string;
}) {
  const { state, gone, setGone, accept } = useChatState(initial, groupId);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const senders = new Map(state.senders.map((s) => [s.id, s]));
  const now = new Date(state.serverNow);
  const rows = threadRows(state.messages, viewer.id);
  const used = length(draft);
  const over = used > MAX_CHAT_TEXT;
  const left = MAX_CHAT_TEXT - used;

  // Opens at the latest message, and follows new ones in only while the member
  // is already reading the latest: scrolled up into history, the thread stays put.
  useLayoutEffect(() => {
    const box = scroller.current;
    if (box && stickToBottom.current) box.scrollTop = box.scrollHeight;
  }, [state.messages]);

  const onScroll = () => {
    const box = scroller.current;
    if (box) stickToBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < NEAR_BOTTOM_PX;
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
        body: JSON.stringify({ group: groupId, text: draft }),
      });
      if (response.ok) {
        stickToBottom.current = true;
        accept((await response.json()) as ChatStateJson, response.headers.get("etag"));
        setDraft("");
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

  return (
    <>
      {/* `relative` so the sr-only names, which are absolutely positioned, scroll inside this box rather than stretching the page. */}
      <div ref={scroller} onScroll={onScroll} className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {rows.length === 0 ? (
          <Empty groupName={groupName} />
        ) : (
          <ol role="log" aria-label="Messages" className="mt-auto flex flex-col gap-1 px-4 py-3">
            {rows.map((row) => (
              <Message key={row.message.id} row={row} sender={senders.get(row.message.memberId)} now={now} />
            ))}
          </ol>
        )}
      </div>

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
            id="chat-message"
            type="text"
            autoComplete="off"
            enterKeyHint="send"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
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
    </>
  );
}

function Message({ row, sender, now }: { row: ThreadRow; sender: MemberJson | undefined; now: Date }) {
  const { message, mine, head, tail } = row;
  const time = chatTimeLabel(message.createdAt, now);
  const name = sender?.displayName ?? "Someone";

  if (mine) {
    return (
      <li className={`flex flex-col items-end gap-0.5 ${head ? "pt-2" : ""}`}>
        {head ? <span className="pr-3 text-xs text-muted-foreground">{time}</span> : null}
        <span className="sr-only">You:</span>
        <p className="max-w-[270px] rounded-[14px] bg-primary px-3 py-2 text-base leading-[22px] break-words whitespace-pre-wrap text-primary-foreground">
          {message.text}
        </p>
      </li>
    );
  }

  return (
    <li className={`flex items-end gap-2 ${head ? "pt-2" : ""}`}>
      <div className="flex w-7 shrink-0" aria-hidden>
        {tail ? <Pennant avatarId={sender?.avatarId ?? null} name={name} size={28} /> : null}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        {head ? (
          <div className="flex items-baseline gap-1.5 pl-3 text-xs">
            <span className="font-bold">{name}</span>
            <span className="text-muted-foreground">{time}</span>
          </div>
        ) : (
          <span className="sr-only">{name}:</span>
        )}
        <p className="max-w-[270px] rounded-[14px] border border-settled-border bg-card px-3 py-2 text-base leading-[22px] break-words whitespace-pre-wrap">
          {message.text}
        </p>
      </div>
    </li>
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
