import Image from "next/image";
import Link from "next/link";
import { CircleHelp, Shield } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Phone screen header: mark, title, optional subtitle, a link to the Rules,
 * a commissioner-only link to the Console, and a slot on the right.
 */
export function AppHeader({
  title,
  sub,
  commissioner,
  right,
}: {
  title: ReactNode;
  sub?: ReactNode;
  commissioner?: boolean;
  right?: ReactNode;
}) {
  return (
    <header className="flex items-center gap-3 px-4 pt-3 pb-2">
      <Image src="/brand/mark.svg" alt="" width={36} height={36} priority unoptimized />
      <div className="min-w-0 flex-1">
        <h1 className="m-0 font-display text-[22px] leading-7">{title}</h1>
        {sub ? <div className="text-sm leading-5 text-muted-foreground">{sub}</div> : null}
      </div>
      {commissioner ? (
        <Link
          href="/console"
          aria-label="Commissioner console"
          className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground"
        >
          <Shield size={20} />
        </Link>
      ) : null}
      <Link
        href="/rules"
        aria-label="Scoring rules"
        className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground"
      >
        <CircleHelp size={20} />
      </Link>
      {right}
    </header>
  );
}
