import type { ReactNode } from "react";
import { db } from "@/db";
import { BottomNav } from "@/components/bottom-nav";
import { requireMember } from "@/lib/members/current";
import { picksOpenFor } from "@/lib/picks/picks";
import { deadlinePassed, publishedSlate } from "@/lib/slate/slate";

/**
 * The member screens — the Week, pick entry, the Live Board, the Leaderboard
 * and a week's results — share one piece of chrome, the bottom nav, and it
 * mounts here once rather than on each screen. The group exists for that:
 * the URLs are unchanged, and the welcome and install pages stay outside it
 * because a first visit has nowhere else to go yet.
 *
 * `requireMember` is cached per request, so the page underneath pays for the
 * session once, not twice.
 */
export default async function MemberLayout({ children }: { children: ReactNode }) {
  const member = await requireMember();
  const slate = await publishedSlate(db());
  const locked = slate ? deadlinePassed(slate.week, new Date()) : false;
  const picksOpen = slate && !locked ? await picksOpenFor(db(), member, slate) : false;
  return (
    <>
      {children}
      <BottomNav locked={locked} picksOpen={picksOpen} />
    </>
  );
}
