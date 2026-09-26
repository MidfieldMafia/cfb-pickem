import type { ReactNode } from "react";
import { findAvatar } from "@/lib/avatars";
import { MemberMenu as DSMemberMenu } from "@saturday-slate/design-system";
import type { MemberJson } from "@/lib/slate/json";
import { WhatsNewMenuRow } from "./whats-new";

/**
 * Resolves the member's avatar and forwards to the design system's presentational
 * `MemberMenu`, with the What's new row that reopens the modal.
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
    </DSMemberMenu>
  );
}
