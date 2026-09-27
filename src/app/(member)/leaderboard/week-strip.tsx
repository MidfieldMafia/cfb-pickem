import Link from "next/link";
import { ChevronRight, Eye, Radio } from "lucide-react";

import { SolidTrophy } from "./solid-trophy";
import type { StripTile } from "./week-view";

/** The live mark: lucide's Radio with its centre filled, the Live Board tab's icon made solid for 12px. */
function SolidLive() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
      <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
      <circle cx={12} cy={12} r={3} fill="currentColor" stroke="none" />
      <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
      <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />
    </svg>
  );
}

/**
 * Season, then every played Week newest first, scrolling sideways under the
 * header. Plain links, as the chips were: a GET per view, nothing to hydrate,
 * and the tile marked current is the one the URL names.
 */
export function WeekStrip({ tiles }: { tiles: StripTile[] }) {
  return (
    <nav aria-label="Standings" className="flex shrink-0 gap-1 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
      {tiles.map((tile) => (
        <Link
          key={tile.key}
          href={tile.href}
          aria-current={tile.current ? "page" : undefined}
          aria-label={tile.label}
          className={`flex h-16 shrink-0 flex-col items-center justify-center gap-px rounded-md border no-underline ${
            tile.season ? "w-16" : "w-12"
          } ${tile.current ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"}`}
        >
          <span
            className={`text-[11px] font-bold uppercase leading-3 tracking-[0.08em] ${
              tile.current ? "text-primary-foreground" : "text-secondary"
            }`}
          >
            {tile.caption}
          </span>
          <span className={`font-display font-black leading-6 ${tile.season ? "text-xs" : "text-[22px]"}`}>
            {tile.title}
          </span>
          <span
            className={`flex h-4 items-center gap-[3px] text-xs font-bold ${
              tile.current ? "text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {tile.won ? (
              <span className={tile.current ? "text-primary-foreground" : "text-leader"}>
                <SolidTrophy />
              </span>
            ) : null}
            {tile.live ? (
              <span className={tile.current ? "text-primary-foreground" : "text-live"}>
                <SolidLive />
              </span>
            ) : null}
            {tile.place}
          </span>
        </Link>
      ))}
    </nav>
  );
}

/**
 * Above a Week in progress: what is left of it and a way back to the Live
 * Board, where it is being played. Gone once the Week is final. No freshness
 * line, unlike the Live Board's: this screen does not poll, so it would only
 * count up from the page load.
 */
export function LiveWeekCard({ left }: { left: string }) {
  return (
    <Link
      href="/live"
      aria-label={`${left}. Open the Live Board`}
      className="flex min-h-14 items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2 text-foreground no-underline"
    >
      <Radio size={20} aria-hidden className="shrink-0" />
      <p className="grow text-sm font-bold">{left}</p>
      <ChevronRight size={16} aria-hidden className="shrink-0 text-muted-foreground" />
    </Link>
  );
}

/**
 * Under a finished Week's standings (board 9): the way into that Week's
 * Reveal, every Member's pick game by game, which has its own screen so the
 * standings stay short.
 */
export function RevealCard({ href, weekNumber }: { href: string; weekNumber: number }) {
  return (
    <Link
      href={href}
      className="flex min-h-14 items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2 text-foreground no-underline"
    >
      <Eye size={20} aria-hidden className="shrink-0" />
      <span className="flex grow flex-col">
        <span className="text-sm font-bold">Week {weekNumber} Reveal</span>
        <span className="text-xs text-muted-foreground">Your picks, and every Member&rsquo;s, game by game</span>
      </span>
      <ChevronRight size={16} aria-hidden className="shrink-0 text-muted-foreground" />
    </Link>
  );
}
