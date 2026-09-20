import type { ReactNode } from "react";
import { findAvatar } from "@/lib/avatars";
import { MemberMenu as DSMemberMenu } from "@saturday-slate/design-system";
import type { MemberJson } from "@/lib/slate/json";

/** Resolves the member's avatar and forwards to the design system's presentational `MemberMenu`. */
export function MemberMenu({
  member,
  group,
  manage,
}: {
  member: Pick<MemberJson, "avatarId" | "displayName">;
  group?: ReactNode;
  manage?: string | null;
}) {
  return <DSMemberMenu avatar={findAvatar(member.avatarId)} displayName={member.displayName} group={group} manage={manage} />;
}
