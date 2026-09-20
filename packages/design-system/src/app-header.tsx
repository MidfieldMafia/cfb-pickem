import Image from "next/image";
import type { ReactNode } from "react";
import { HeaderLinks } from "./header-links";

/**
 * Phone screen header: mark, title, optional subtitle, the `HeaderLinks`
 * (How to play), and a slot on the right, which member screens fill with a
 * `MemberMenu`.
 *
 * Two lines, and the subtitle is one: it truncates rather than wrap, so keep it
 * short and put any sentence in the page body. Which group a board belongs to, and the Manage link, live
 * in the `MemberMenu` rather than stacking above the title: a third line
 * pushed the header up into the iPhone status bar.
 *
 * The top padding is `HEADER_TOP`, shared with the two pick screens that draw
 * headers of their own so the mark sits at the same height on every screen. It
 * carries no safe-area inset: `body` already pads by the inset, and adding it
 * here as well pushed this header down twice as far as the pick screens.
 */
export const HEADER_TOP = "pt-[1.125rem]";

export function AppHeader({
  title,
  sub,
  right,
}: {
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className={`flex items-center gap-3 px-4 pb-2 ${HEADER_TOP}`}>
      <Image src="/brand/mark.svg" alt="" width={44} height={44} priority unoptimized />
      <div className="min-w-0 flex-1">
        <h1 className="m-0 font-display text-[22px] leading-7">{title}</h1>
        {sub ? <div className="truncate text-sm leading-5 text-muted-foreground">{sub}</div> : null}
      </div>
      <HeaderLinks />
      {right}
    </header>
  );
}
