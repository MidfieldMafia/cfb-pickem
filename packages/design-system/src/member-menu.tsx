import Link from "next/link";
import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { Pennant, type PennantMark } from "./pennant";
import { SECTION_LABEL } from "./section-label";

/** A row of the `MemberMenu` panel, for a caller's own rows passed as `children`. */
export const MENU_ROW = "flex min-h-tap items-center gap-2 rounded-sm px-2 text-sm font-semibold no-underline hover:bg-accent";

/**
 * The signed-in member in a header, as a menu: their pennant alone (it already
 * says whose screen this is, so no name beside it), opening a panel with the
 * group they are looking at, the Manage link for whoever runs things, and a
 * link to the You screen.
 *
 * `<details>` rather than a menu library, for the reason `GroupSwitcher` gives:
 * it opens without JavaScript and is safe to render inside a `"use client"`
 * tree. Presentational: the caller resolves the avatar, the group slot and
 * the Manage href. `children` are the caller's own rows, set before the You
 * link.
 */
export function MemberMenu({
  avatar,
  displayName,
  group,
  manage,
  href = "/you",
  children,
}: {
  avatar: PennantMark | undefined;
  displayName: string;
  /** The group's name, or the switcher for a member of two or more. */
  group?: ReactNode;
  /** Where Manage goes, from `currentManageHref`; no row when absent. */
  manage?: string | null;
  href?: string;
  /** Extra rows, styled with `MENU_ROW`, between Manage and the You link. */
  children?: ReactNode;
}) {
  return (
    <details className="group relative shrink-0">
      <summary
        className="flex min-h-tap min-w-tap cursor-pointer list-none items-center justify-center [&::-webkit-details-marker]:hidden"
        aria-label={`Menu for ${displayName}`}
      >
        <Pennant avatar={avatar} name={displayName} size={44} />
      </summary>
      <div className="absolute right-0 z-20 mt-1 grid min-w-56 gap-1 rounded-md border border-border bg-card p-1 shadow-md">
        {group ? (
          <div className="grid gap-0.5 px-2 pt-1">
            <p className={SECTION_LABEL}>Group</p>
            {group}
          </div>
        ) : null}
        {manage ? (
          <Link href={manage} className={MENU_ROW}>
            <ShieldCheck size={16} className="shrink-0 text-primary" aria-hidden />
            Manage
          </Link>
        ) : null}
        {children}
        <Link href={href} className={MENU_ROW}>
          {displayName}
          <span className="font-normal text-muted-foreground">Your profile</span>
        </Link>
      </div>
    </details>
  );
}
