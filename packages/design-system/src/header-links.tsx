import Link from "next/link";
import { CircleHelp, Shield } from "lucide-react";

const ICON_LINK = "grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground";

/**
 * The header icons every member screen carries: a link to How to play, and the
 * Manage link — the console for a commissioner, the group's Manage screen for
 * its organizer, absent for everyone else (`currentManageHref` decides). `AppHeader` renders them, and so do
 * the two pick screens, which draw headers of their own — without this they
 * were the one place a member couldn't reach either.
 *
 * A fragment, so the icons sit in whatever flex row the header already lays out.
 */
export function HeaderLinks({ manage }: { manage?: string | null }) {
  return (
    <>
      {manage ? (
        <Link href={manage} aria-label="Manage" className={ICON_LINK}>
          <Shield size={20} />
        </Link>
      ) : null}
      <Link href="/rules" aria-label="How to play" className={ICON_LINK}>
        <CircleHelp size={20} />
      </Link>
    </>
  );
}
