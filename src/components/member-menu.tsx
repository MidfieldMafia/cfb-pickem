import type { ReactNode } from "react";
import { findAvatar } from "@/lib/avatars";
import { Bell } from "lucide-react";
import Link from "next/link";
import { MemberMenu as DSMemberMenu, MENU_ROW } from "@saturday-slate/design-system";
import type { MemberJson } from "@/lib/slate/json";
import { WhatsNewMenuRow } from "./whats-new";

/**
 * Resolves the member's avatar and forwards to the design system's presentational
 * `MemberMenu`, with the Notifications row and the What's new row that reopens the modal.
 */
export function MemberMenu({
  member,
  group,
  manage,
}: {
  member: Pick<MemberJson, "avatarId" | "displayName">;
  group?: ReactNode;
  manage?: string | null;
}) {
  return (
    <DSMemberMenu avatar={findAvatar(member.avatarId)} displayName={member.displayName} group={group} manage={manage}>
      <Link href="/you/notifications" className={MENU_ROW}>
        <Bell size={16} className="shrink-0 text-primary" aria-hidden />
        Notifications
      </Link>
      <WhatsNewMenuRow />
    </DSMemberMenu>
  );
}
