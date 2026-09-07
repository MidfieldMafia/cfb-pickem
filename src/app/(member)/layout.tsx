import type { ReactNode } from "react";
import { BottomNav } from "@/components/bottom-nav";
import { requireMember } from "@/lib/members/current";

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
  return (
    <>
      {children}
      <BottomNav commissioner={member.isCommissioner} />
    </>
  );
}
