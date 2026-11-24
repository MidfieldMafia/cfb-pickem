"use client";

import { Trophy } from "lucide-react";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { LOOK_KEY } from "@/lib/launch";
import type { WeekLook } from "@/lib/week/look";
import { rivalryOf } from "@/lib/week/rivalry";

/**
 * The Week's Look (`weekLook`), read once by the member layout and handed to
 * every screen under it, server and client alike: the pick flow and the Live
 * Board draw their own headers on the client, so a prop from the layout could
 * not reach them.
 */
const LookContext = createContext<WeekLook | null>(null);

export function WeekLookProvider({ look, children }: { look: WeekLook | null; children: ReactNode }) {
  useEffect(() => {
    // Remembered for the launch screen, which shows before any layout has read
    // the Week: LAUNCH_GUARD puts it on <html> ahead of the first paint.
    try {
      if (look) localStorage.setItem(LOOK_KEY, look);
      else localStorage.removeItem(LOOK_KEY);
    } catch {}
  }, [look]);
  return <LookContext.Provider value={look}>{children}</LookContext.Provider>;
}

export function useWeekLook(): WeekLook | null {
  return useContext(LookContext);
}

/** The band's own height (its `h-7`), for anything that sticks just below it. */
export const BAND_HEIGHT = 28;

/**
 * The 28px rust strip that reads RIVALRY WEEK between two hairlines. Its
 * markup only: `RivalryBand` decides when it shows on a member screen, and the
 * launch screen's CSS decides there.
 */
export function RivalryStrip({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex h-7 shrink-0 items-center justify-center gap-2 bg-secondary text-secondary-foreground ${className}`}
    >
      <span aria-hidden className="h-px w-6 bg-current" />
      <span className="text-xs leading-none font-bold tracking-[0.08em] uppercase">Rivalry Week</span>
      <span aria-hidden className="h-px w-6 bg-current" />
    </div>
  );
}

/**
 * The Rivalry Week band, for directly under a member screen's header. It sticks
 * at the top once the header has scrolled away, so the Look never scrolls off
 * with the content. Nothing at all renders while the Look is off. A screen
 * whose column spaces its children cancels that gap with `className`, so the
 * band meets the header.
 */
export function RivalryBand({ className = "" }: { className?: string }) {
  if (useWeekLook() !== "rivalry") return null;
  return <RivalryStrip className={`sticky top-[env(safe-area-inset-top)] z-10 self-stretch ${className}`} />;
}

/**
 * A rivalry game's name, billed above the matchup while the Rivalry Week Look
 * is on (#591), with "For the <trophy>" under it when the game has one. On
 * Picks it is ruled above and below with the rust double rule; on the game
 * sheet it is the headline, larger and unruled. Nothing renders for an
 * ordinary game or while the Look is off.
 */
export function RivalryTitle({
  game,
  variant,
}: {
  game: { awayTeam: string; homeTeam: string };
  variant: "picks" | "sheet";
}) {
  const rivalry = rivalryOf(useWeekLook(), game);
  if (!rivalry) return null;
  const picks = variant === "picks";
  return (
    <div
      className={`flex flex-col items-center gap-0.5 text-center ${
        picks ? "border-y-[3px] border-double border-secondary pt-0.5 pb-1" : "px-4 pt-3.5"
      }`}
    >
      <span
        className={`font-display font-black text-foreground ${picks ? "text-[26px] leading-8" : "text-[28px] leading-[34px]"}`}
      >
        {rivalry.name}
      </span>
      {rivalry.trophy ? (
        <span className="inline-flex items-center gap-1.5 text-[13px] leading-[18px] text-muted-foreground">
          <Trophy size={14} aria-hidden />
          For the {rivalry.trophy}
        </span>
      ) : null}
    </div>
  );
}
