"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, Lock, MessageCircle, Radio, Trophy } from "lucide-react";
import type { ChatUnreadJson } from "@/lib/chat/json";
import { BADGE_POLL_MS } from "@/lib/chat/poll";

const TABS = [
  { href: "/picks", label: "Picks", Icon: ClipboardCheck },
  { href: "/live", label: "Live Board", Icon: Radio },
  { href: "/leaderboard", label: "Leaderboard", Icon: Trophy },
  { href: "/chat", label: "Chat", Icon: MessageCircle },
] as const;

const CHAT = "/chat";

/**
 * The Chat tab's unread count for the Group on screen. The layout counts it
 * once for the first paint; a layout is not rendered again on a move between
 * tabs, so from then on the badge asks for itself — every minute while the app
 * is visible, and straight away on coming back to it or changing tab. On the
 * Chat screen it is zero, and not asked: the thread there is being read.
 */
function useChatUnread(initial: number, onChat: boolean): number {
  const [unread, setUnread] = useState(initial);
  const [wasOnChat, setWasOnChat] = useState(onChat);
  // Leaving the thread means it was read: clear the count now rather than
  // showing the old one until the next answer.
  if (wasOnChat !== onChat) {
    setWasOnChat(onChat);
    if (onChat) setUnread(0);
  }

  useEffect(() => {
    if (onChat) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible") {
        try {
          const response = await fetch("/api/chat/unread", { cache: "no-store" });
          if (response.ok && !cancelled) setUnread(((await response.json()) as ChatUnreadJson).unread);
        } catch {
          // A missed count is only a stale badge; the next poll tries again.
        }
      }
      if (!cancelled) timer = setTimeout(() => void poll(), BADGE_POLL_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [onChat]);

  return onChat ? 0 : unread;
}

/**
 * The four tabs of the phone app, the same for every member — History merged
 * into the Leaderboard's Week chips (#242), and Chat is the fourth (#248). The Console
 * lives behind a header icon (`HeaderLinks`) rather than a tab now, since it is
 * only ever relevant to a commissioner. Fixed to the visual viewport (not
 * sticky), so it stays under the thumb through an iOS pinch-zoom or URL-bar
 * transition instead of drifting with the layout viewport — see issue #99.
 *
 * Rendered twice: once `invisible` in normal flow, to reserve exactly the
 * space the real nav occupies so `main`'s `flex-1` still ends above it, and
 * once `fixed` on top for display. Two copies of the same markup keep that
 * space correct without hand-computing a height that content or font metrics
 * could drift out of sync with; `visibility: hidden` also drops the spacer's
 * copy out of the tab order and the accessibility tree, so only one `nav`
 * landmark is exposed.
 */
export function BottomNav({ locked, picksOpen, chatUnread }: { locked: boolean; picksOpen: boolean; chatUnread: number }) {
  const pathname = usePathname();
  const unread = useChatUnread(chatUnread, pathname === CHAT || pathname.startsWith(`${CHAT}/`));

  const tiles = TABS.map(({ href, label, Icon }) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    const isPicks = href === "/picks";
    // Once the week locks there is nothing to enter, so the Picks tab goes
    // straight to /picks/review rather than through /picks's redirect, which
    // cost a second round trip (#262). The label stays "Picks" so the tab bar
    // doesn't relabel mid-week, but the icon becomes a lock to say a tap now
    // lands somewhere other than pick entry. See #116, #170.
    const tabHref = isPicks && locked ? "/picks/review" : href;
    const TabIcon = isPicks && locked ? Lock : Icon;
    // The dot means something is still to do: it shows while picks are open and
    // the member has not finished them, and clears once they have.
    const showTodoDot = isPicks && !locked && picksOpen;
    const badge = href === CHAT && unread > 0 ? unread : null;
    return (
      <Link
        key={href}
        href={tabHref}
        aria-current={active ? "page" : undefined}
        className="flex min-h-14 flex-col items-center justify-center gap-1 p-1.5 text-[11px] font-bold no-underline"
      >
        <span
          className={`relative grid h-7 w-14 place-items-center rounded-full ${
            active ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          <TabIcon size={18} />
          {showTodoDot ? (
            <span
              aria-hidden
              className={`absolute right-2.5 top-0 h-2 w-2 rounded-full ring-2 ${
                active ? "bg-primary-foreground ring-primary" : "bg-primary ring-card"
              }`}
            />
          ) : null}
          {badge !== null ? (
            <span
              aria-hidden
              className="absolute -top-1 right-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[11px] leading-none font-bold text-primary-foreground tabular-nums ring-2 ring-card"
            >
              {badge > 9 ? "9+" : badge}
            </span>
          ) : null}
        </span>
        <span className={active ? "text-foreground" : "text-muted-foreground"}>
          {label}
          {isPicks && locked ? <span className="sr-only"> — picks are locked, tap to review</span> : null}
          {showTodoDot ? <span className="sr-only"> — picks still to finish</span> : null}
          {badge !== null ? <span className="sr-only">, {badge === 1 ? "1 new message" : `${badge} new messages`}</span> : null}
        </span>
      </Link>
    );
  });

  return (
    <>
      <div
        aria-hidden
        className="invisible grid grid-cols-4 border-t border-border pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
      >
        {tiles}
      </div>
      <nav
        aria-label="App"
        className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-border bg-card pr-[env(safe-area-inset-right)] pb-[calc(0.5rem+env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)]"
      >
        {tiles}
      </nav>
    </>
  );
}
