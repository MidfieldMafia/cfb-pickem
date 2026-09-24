import type { ReactNode } from "react";
import Link from "next/link";

export type BottomNavTab = {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  /** A small dot on the pill: something here is still to do. */
  dot?: boolean;
  /** A count on the pill; shown when above zero, capped at "9+". */
  count?: number;
  /** Read after the label by a screen reader, e.g. " — picks still to finish". */
  srNote?: string;
};

/**
 * The phone app's tab bar, `AppHeader`'s counterpart at the bottom of the
 * screen. Presentational: the caller decides the tabs, which one is active,
 * where each goes and what its dot or count says.
 *
 * Each tile is an 18px icon in a pill, filled when active, over an 11px label.
 * The dot and the count sit on the pill's top edge with a ring the colour of
 * whatever is behind them.
 *
 * Fixed to the visual viewport (not sticky), so it stays under the thumb
 * through an iOS pinch-zoom or URL-bar transition instead of drifting with the
 * layout viewport — see issue #99.
 *
 * Rendered twice: once `invisible` in normal flow, to reserve exactly the
 * space the real nav occupies so `main`'s `flex-1` still ends above it, and
 * once `fixed` on top for display. Two copies of the same markup keep that
 * space correct without hand-computing a height that content or font metrics
 * could drift out of sync with; `visibility: hidden` also drops the spacer's
 * copy out of the tab order and the accessibility tree, so only one `nav`
 * landmark is exposed.
 */
export function BottomNav({ tabs, label = "App" }: { tabs: readonly BottomNavTab[]; label?: string }) {
  const cols = { gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` };
  const tiles = tabs.map((tab) => <BottomNavTile key={tab.href} {...tab} />);
  return (
    <>
      <div
        aria-hidden
        style={cols}
        className="invisible grid border-t border-border pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
      >
        {tiles}
      </div>
      <nav
        aria-label={label}
        style={cols}
        className="fixed inset-x-0 bottom-0 z-10 grid border-t border-border bg-card pr-[env(safe-area-inset-right)] pb-[calc(0.5rem+env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)]"
      >
        {tiles}
      </nav>
    </>
  );
}

function BottomNavTile({ href, label, icon, active, dot, count, srNote }: BottomNavTab) {
  const badge = count !== undefined && count > 0 ? count : null;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="flex min-h-14 flex-col items-center justify-center gap-1 p-1.5 text-[11px] font-bold no-underline"
    >
      <span
        className={`relative grid h-7 w-14 place-items-center rounded-full ${
          active ? "bg-primary text-primary-foreground" : "text-muted-foreground"
        }`}
      >
        {icon}
        {dot ? (
          <span
            aria-hidden
            className={`absolute right-2.5 top-0 h-2 w-2 rounded-full ring-2 ${
              active ? "bg-primary-foreground ring-primary" : "bg-primary ring-card"
            }`}
          />
        ) : null}
        {badge !== null ? (
          <span
            aria-hidden
            className="absolute -top-1 right-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[11px] leading-none font-bold text-primary-foreground tabular-nums ring-2 ring-card"
          >
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </span>
      <span className={active ? "text-foreground" : "text-muted-foreground"}>
        {label}
        {srNote ? <span className="sr-only">{srNote}</span> : null}
      </span>
    </Link>
  );
}
