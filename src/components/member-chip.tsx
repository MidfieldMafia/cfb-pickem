import Link from "next/link";
import { Pennant } from "@/components/pennant";
import type { MemberJson } from "@/lib/slate/json";

/** The signed-in member in a header: their pennant and name, linking to the welcome page. */
export function MemberChip({ member }: { member: Pick<MemberJson, "avatarId" | "displayName"> }) {
  return (
    <Link href="/welcome" className="flex items-center gap-2 text-sm font-semibold no-underline">
      <Pennant avatarId={member.avatarId} size={28} />
      {member.displayName}
    </Link>
  );
}
