import Image from "next/image";
import type { ReactNode } from "react";
import { HeaderLinks } from "./header-links";

/**
 * Phone screen header: mark, the group this board belongs to, title, optional
 * subtitle, the `HeaderLinks` (Rules, and Manage for whoever runs things), and
 * a slot on the right.
 *
 * `group` sits above the title because it says *whose* board this is, which
 * qualifies the title rather than replacing it: "Mabry Family" over
 * "Leaderboard". Screens that are not a group's board — pick entry, How to
 * play — pass none, and the header is what it always was.
 */
export function AppHeader({
  title,
  sub,
  group,
  manage,
  right,
}: {
  title: ReactNode;
  sub?: ReactNode;
  /** The group's name, or the switcher for a member of two or more. */
  group?: ReactNode;
  /** Where the Manage icon goes, from `currentManageHref`; none when absent. */
  manage?: string | null;
  right?: ReactNode;
}) {
  return (
    <header className="flex items-center gap-3 px-4 pt-3 pb-2">
      <Image src="/brand/mark.svg" alt="" width={36} height={36} priority unoptimized />
      <div className="min-w-0 flex-1">
        {group ? <div className="text-xs leading-4 text-muted-foreground">{group}</div> : null}
        <h1 className="m-0 font-display text-[22px] leading-7">{title}</h1>
        {sub ? <div className="text-sm leading-5 text-muted-foreground">{sub}</div> : null}
      </div>
      <HeaderLinks manage={manage} />
      {right}
    </header>
  );
}
