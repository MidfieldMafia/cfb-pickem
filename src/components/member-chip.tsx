import { findAvatar } from "@/lib/avatars";
import { MemberChip as DSMemberChip } from "@saturday-slate/design-system";
import type { MemberJson } from "@/lib/slate/json";

/** Resolves the member's avatar and forwards to the design system's presentational `MemberChip`. */
export function MemberChip({ member }: { member: Pick<MemberJson, "avatarId" | "displayName"> }) {
  return <DSMemberChip avatar={findAvatar(member.avatarId)} displayName={member.displayName} />;
}
