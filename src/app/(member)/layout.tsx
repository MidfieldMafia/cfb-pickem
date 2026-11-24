import type { ReactNode } from "react";
import { db } from "@/db";
import { AnalyticsMember } from "@/components/analytics-member";
import { BottomNav } from "@/components/bottom-nav";
import { ChampionSheet } from "@/components/champion-sheet";
import { PushRegistrar } from "@/components/push/registrar";
import { WeekLookProvider } from "@/components/week-look";
import { WhatsNew } from "@/components/whats-new";
import { championSheet } from "@/lib/champion/sheet";
import { currentChatUnread } from "@/lib/chat/current";
import { currentGroup } from "@/lib/groups/current";
import { requireMember } from "@/lib/members/current";
import { picksOpenFor } from "@/lib/picks/picks";
import { deadlinePassed, publishedSlate } from "@/lib/slate/slate";
import { weekLook } from "@/lib/week/look";
import { championSheetSeenAction } from "./actions";

/**
 * The member screens — the Week, pick entry, the Live Board, the Leaderboard,
 * a week's results and Chat — share one piece of chrome, the bottom nav, and it
 * mounts here once rather than on each screen. The group exists for that:
 * the URLs are unchanged, and the welcome and install pages stay outside it
 * because a first visit has nowhere else to go yet. The What's new modal
 * mounts here for the same reason, and so does the Week's Look: read here once,
 * each screen puts its `RivalryBand` under its own header. The Regular Season
 * Champion's celebration sheet (#592) opens here too, on whichever member
 * screen is opened first once Week 13 is settled, until it is seen.
 *
 * `requireMember` is cached per request, so the page underneath pays for the
 * session once, not twice.
 */
export default async function MemberLayout({ children }: { children: ReactNode }) {
  const member = await requireMember();
  const slate = await publishedSlate(db());
  const now = new Date();
  const locked = slate ? deadlinePassed(slate.week, now) : false;
  const picksOpen = slate && !locked ? await picksOpenFor(db(), member, slate) : false;
  const chatUnread = await currentChatUnread(member);
  const groupId = await currentGroup();
  const sheet = groupId === null ? null : await championSheet(db(), member.id, groupId, now);
  return (
    <WeekLookProvider look={weekLook(slate, now)}>
      <AnalyticsMember memberId={member.id} />
      {children}
      <WhatsNew />
      {sheet && groupId !== null ? (
        <ChampionSheet key={groupId} {...sheet} onSeen={championSheetSeenAction.bind(null, groupId)} />
      ) : null}
      <PushRegistrar />
      <BottomNav locked={locked} picksOpen={picksOpen} chatUnread={chatUnread} />
    </WeekLookProvider>
  );
}
