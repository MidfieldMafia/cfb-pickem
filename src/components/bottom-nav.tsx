"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BottomNav as BottomNavBar, type BottomNavTab } from "@saturday-slate/design-system";
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
 * only ever relevant to a commissioner. The tab bar itself — tiles, dot, count,
 * the fixed bar and its spacer — is the design system's `BottomNav`; this
 * decides where each tab goes and what it says.
 */
export function BottomNav({ locked, picksOpen, chatUnread }: { locked: boolean; picksOpen: boolean; chatUnread: number }) {
  const pathname = usePathname();
  const unread = useChatUnread(chatUnread, pathname === CHAT || pathname.startsWith(`${CHAT}/`));

  const tabs = TABS.map(({ href, label, Icon }): BottomNavTab => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    if (href === "/picks") {
      // Once the week locks there is nothing to enter, so the Picks tab goes
      // straight to /picks/review rather than through /picks's redirect, which
      // cost a second round trip (#262). The label stays "Picks" so the tab bar
      // doesn't relabel mid-week, but the icon becomes a lock to say a tap now
      // lands somewhere other than pick entry. See #116, #170.
      if (locked) {
        return { href: "/picks/review", label, icon: <Lock size={18} />, active, srNote: " — picks are locked, tap to review" };
      }
      // The dot means something is still to do: it shows while picks are open and
      // the member has not finished them, and clears once they have.
      return {
        href,
        label,
        icon: <Icon size={18} />,
        active,
        dot: picksOpen,
        srNote: picksOpen ? " — picks still to finish" : undefined,
      };
    }
    if (href === CHAT && unread > 0) {
      return {
        href,
        label,
        icon: <Icon size={18} />,
        active,
        count: unread,
        srNote: `, ${unread === 1 ? "1 new message" : `${unread} new messages`}`,
      };
    }
    return { href, label, icon: <Icon size={18} />, active };
  });

  return <BottomNavBar tabs={tabs} />;
}
