import Link from "next/link";
import { Pennant, type PennantMark } from "./pennant";

/**
 * The signed-in member in a header: their pennant and name, linking to the
 * You screen. `tap` because the 28px pennant is the whole visual and the
 * base layer only forces 44px on buttons and inputs, never on a link.
 * Presentational: the caller resolves the member's avatar.
 */
export function MemberChip({
  avatar,
  displayName,
  href = "/you",
}: {
  avatar: PennantMark | undefined;
  displayName: string;
  href?: string;
}) {
  return (
    <Link href={href} className="tap flex items-center gap-2 text-sm font-semibold no-underline">
      <Pennant avatar={avatar} name={displayName} size={28} />
      {displayName}
    </Link>
  );
}
