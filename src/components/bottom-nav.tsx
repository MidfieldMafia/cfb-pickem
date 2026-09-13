"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, Radio, Shield, Trophy } from "lucide-react";

const TABS = [
  { href: "/picks", label: "Picks", Icon: ClipboardCheck },
  { href: "/live", label: "Live Board", Icon: Radio },
  { href: "/leaderboard", label: "Leaderboard", Icon: Trophy },
  { href: "/console", label: "Commissioner", Icon: Shield },
] as const;

/**
 * The four tabs of the phone app — three for a member who is not a
 * commissioner, since the console answers everyone else with a 404 and a tab
 * that 404s is worse than no tab. Fixed to the visual viewport (not sticky),
 * so it stays under the thumb through an iOS pinch-zoom or URL-bar transition
 * instead of drifting with the layout viewport — see issue #99.
 *
 * Rendered twice: once `invisible` in normal flow, to reserve exactly the
 * space the real nav occupies so `main`'s `flex-1` still ends above it, and
 * once `fixed` on top for display. Two copies of the same markup keep that
 * space correct without hand-computing a height that content or font metrics
 * could drift out of sync with; `visibility: hidden` also drops the spacer's
 * copy out of the tab order and the accessibility tree, so only one `nav`
 * landmark is exposed.
 */
export function BottomNav({ commissioner }: { commissioner: boolean }) {
  const pathname = usePathname();
  const tabs = commissioner ? TABS : TABS.filter((tab) => tab.href !== "/console");
  const gridColsClassName = commissioner ? "grid-cols-4" : "grid-cols-3";

  const tiles = tabs.map(({ href, label, Icon }) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className="flex min-h-14 flex-col items-center justify-center gap-1 p-1.5 text-[11px] font-bold no-underline"
      >
        <span
          className={`grid h-7 w-14 place-items-center rounded-full ${
            active ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          <Icon size={18} />
        </span>
        <span className={active ? "text-foreground" : "text-muted-foreground"}>{label}</span>
      </Link>
    );
  });

  return (
    <>
      <div
        aria-hidden
        className={`invisible grid border-t border-border pb-[calc(0.5rem+env(safe-area-inset-bottom))] ${gridColsClassName}`}
      >
        {tiles}
      </div>
      <nav
        aria-label="App"
        className={`fixed inset-x-0 bottom-0 z-10 grid border-t border-border bg-card pb-[calc(0.5rem+env(safe-area-inset-bottom))] ${gridColsClassName}`}
      >
        {tiles}
      </nav>
    </>
  );
}
