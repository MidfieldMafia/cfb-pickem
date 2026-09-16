import Link from "next/link";
import { Pennant } from "@/components/pennant";
import type { MemberJson } from "@/lib/slate/json";

/**
 * The signed-in member in a header: their pennant and name, linking to the
 * You screen. `tap` because the 28px pennant is the whole visual and the
 * base layer only forces 44px on buttons and inputs, never on a link.
 */
export function MemberChip({ member }: { member: Pick<MemberJson, "avatarId" | "displayName"> }) {
  return (
    <Link href="/you" className="tap flex items-center gap-2 text-sm font-semibold no-underline">
      <Pennant avatarId={member.avatarId} name={member.displayName} size={28} />
      {member.displayName}
    </Link>
  );
}
