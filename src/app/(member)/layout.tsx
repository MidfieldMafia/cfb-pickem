import type { ReactNode } from "react";
import { db } from "@/db";
import { AnalyticsMember } from "@/components/analytics-member";
import { BottomNav } from "@/components/bottom-nav";
import { WhatsNew } from "@/components/whats-new";
import { currentChatUnread } from "@/lib/chat/current";
import { requireMember } from "@/lib/members/current";
import { picksOpenFor } from "@/lib/picks/picks";
import { deadlinePassed, publishedSlate } from "@/lib/slate/slate";

/**
 * The member screens — the Week, pick entry, the Live Board, the Leaderboard,
 * a week's results and Chat — share one piece of chrome, the bottom nav, and it
 * mounts here once rather than on each screen. The group exists for that:
 * the URLs are unchanged, and the welcome and install pages stay outside it
 * because a first visit has nowhere else to go yet. The What's new modal
 * mounts here for the same reason.
 *
 * `requireMember` is cached per request, so the page underneath pays for the
 * session once, not twice.
 */
export default async function MemberLayout({ children }: { children: ReactNode }) {
  const member = await requireMember();
  const slate = await publishedSlate(db());
  const locked = slate ? deadlinePassed(slate.week, new Date()) : false;
  const picksOpen = slate && !locked ? await picksOpenFor(db(), member, slate) : false;
  const chatUnread = await currentChatUnread(member);
  return (
    <>
      <AnalyticsMember memberId={member.id} />
      {children}
      <WhatsNew />
      <BottomNav locked={locked} picksOpen={picksOpen} chatUnread={chatUnread} />
    </>
  );
}
