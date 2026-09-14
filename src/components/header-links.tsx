import Link from "next/link";
import { CircleHelp, Shield } from "lucide-react";

const ICON_LINK = "grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground";

/**
 * The header icons every member screen carries: a link to the Rules, and a
 * commissioner-only link to the Console. `AppHeader` renders them, and so do
 * the two pick screens, which draw headers of their own — without this they
 * were the one place a member couldn't reach either.
 *
 * A fragment, so the icons sit in whatever flex row the header already lays out.
 */
export function HeaderLinks({ commissioner }: { commissioner?: boolean }) {
  return (
    <>
      {commissioner ? (
        <Link href="/console" aria-label="Commissioner console" className={ICON_LINK}>
          <Shield size={20} />
        </Link>
      ) : null}
      <Link href="/rules" aria-label="Scoring rules" className={ICON_LINK}>
        <CircleHelp size={20} />
      </Link>
    </>
  );
}
