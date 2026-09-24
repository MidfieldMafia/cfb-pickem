"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, Lock, Radio, Trophy } from "lucide-react";

const TABS = [
  { href: "/picks", label: "Picks", Icon: ClipboardCheck },
  { href: "/live", label: "Live Board", Icon: Radio },
  { href: "/leaderboard", label: "Leaderboard", Icon: Trophy },
] as const;

/**
 * The three tabs of the phone app, the same for every member — History merged
 * into the Leaderboard's Week chips (#242), and Chat becomes the fourth in v3
 * (#248). The Console
 * lives behind a header icon (`HeaderLinks`) rather than a tab now, since it is
 * only ever relevant to a commissioner. Fixed to the visual viewport (not
 * sticky), so it stays under the thumb through an iOS pinch-zoom or URL-bar
 * transition instead of drifting with the layout viewport — see issue #99.
 *
 * Rendered twice: once `invisible` in normal flow, to reserve exactly the
 * space the real nav occupies so `main`'s `flex-1` still ends above it, and
 * once `fixed` on top for display. Two copies of the same markup keep that
 * space correct without hand-computing a height that content or font metrics
 * could drift out of sync with; `visibility: hidden` also drops the spacer's
 * copy out of the tab order and the accessibility tree, so only one `nav`
 * landmark is exposed.
 */
export function BottomNav({ locked, picksOpen }: { locked: boolean; picksOpen: boolean }) {
  const pathname = usePathname();

  const tiles = TABS.map(({ href, label, Icon }) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    const isPicks = href === "/picks";
    // The Picks tab silently redirects to /picks/review once the week locks
    // (src/app/(member)/picks/page.tsx) — the label stays "Picks" so the tab
    // bar doesn't relabel mid-week, but the icon becomes a lock to say a tap now
    // lands somewhere other than pick entry. See #116, #170.
    const TabIcon = isPicks && locked ? Lock : Icon;
    // The dot means something is still to do: it shows while picks are open and
    // the member has not finished them, and clears once they have.
    const showTodoDot = isPicks && !locked && picksOpen;
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className="flex min-h-14 flex-col items-center justify-center gap-1 p-1.5 text-[11px] font-bold no-underline"
      >
        <span
          className={`relative grid h-7 w-14 place-items-center rounded-full ${
            active ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          <TabIcon size={18} />
          {showTodoDot ? (
            <span
              aria-hidden
              className={`absolute right-2.5 top-0 h-2 w-2 rounded-full ring-2 ${
                active ? "bg-primary-foreground ring-primary" : "bg-primary ring-card"
              }`}
            />
          ) : null}
        </span>
        <span className={active ? "text-foreground" : "text-muted-foreground"}>
          {label}
          {isPicks && locked ? <span className="sr-only"> — picks are locked, tap to review</span> : null}
          {showTodoDot ? <span className="sr-only"> — picks still to finish</span> : null}
        </span>
      </Link>
    );
  });

  return (
    <>
      <div
        aria-hidden
        className="invisible grid grid-cols-3 border-t border-border pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
      >
        {tiles}
      </div>
      <nav
        aria-label="App"
        className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-3 border-t border-border bg-card pr-[env(safe-area-inset-right)] pb-[calc(0.5rem+env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)]"
      >
        {tiles}
      </nav>
    </>
  );
}
