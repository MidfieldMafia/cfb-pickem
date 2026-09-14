import Image from "next/image";
import type { ReactNode } from "react";
import { HeaderLinks } from "./header-links";

/**
 * Phone screen header: mark, title, optional subtitle, the `HeaderLinks`
 * (Rules, and the Console for a commissioner), and a slot on the right.
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
      <HeaderLinks commissioner={commissioner} />
      {right}
    </header>
  );
}
