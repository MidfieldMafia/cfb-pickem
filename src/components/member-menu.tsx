import type { ReactNode } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { findAvatar } from "@/lib/avatars";
import { MENU_ROW, MemberMenu as DSMemberMenu } from "@saturday-slate/design-system";
import type { MemberJson } from "@/lib/slate/json";
import { WhatsNewMenuRow } from "./whats-new";

/**
 * Resolves the member's avatar and forwards to the design system's presentational
 * `MemberMenu`, with the What's new row that reopens the modal and, beside it,
 * Send feedback (#337) — otherwise only at the foot of the You screen.
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
      <WhatsNewMenuRow />
      <Link href="/you/feedback" className={MENU_ROW}>
        <MessageSquare size={16} className="shrink-0 text-primary" aria-hidden />
        Send feedback
      </Link>
    </DSMemberMenu>
  );
}
