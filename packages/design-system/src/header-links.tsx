import Link from "next/link";
import { CircleHelp } from "lucide-react";

const ICON_LINK = "grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground";

/**
 * The header icon every member screen carries: a link to How to play. `AppHeader`
 * renders it, and so do the two pick screens, which draw headers of their own.
 * Manage lives in the avatar menu, not here.
 *
 * A fragment, so the icons sit in whatever flex row the header already lays out.
 */
export function HeaderLinks() {
  return (
    <>
      <Link href="/rules" aria-label="How to play" className={ICON_LINK}>
        <CircleHelp size={20} />
      </Link>
    </>
  );
}
