"use client";

import Image from "next/image";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Check } from "lucide-react";
import { logoSrc, shortSchool } from "@/lib/logos";

const NAME_PX = 22;
const MIN_NAME_PX = 16;

/**
 * The name's font size, shrunk from 22px just far enough to keep it on one
 * line. ESPN's short names still leave 18 schools too wide for a 390px tile
 * (James Madison, South Carolina, ...). Below 16px it stops and lets the name
 * wrap instead.
 *
 * It measures, rather than guessing from character count, because the room
 * changes with the phone's width. It refits when that width changes, and once
 * the display font loads, since the fallback font's width is no guide.
 */
function useFittedNameSize(ref: RefObject<HTMLSpanElement | null>, text: string): number {
  const [size, setSize] = useState(NAME_PX);

  useLayoutEffect(() => {
    const el = ref.current;
    const room = el?.parentElement;
    if (!el || !room) return;

    const fit = () => {
      // Measure the name on one line at full size, then put back what React set.
      const { fontSize, whiteSpace } = el.style;
      el.style.fontSize = `${NAME_PX}px`;
      el.style.whiteSpace = "nowrap";
      const natural = el.scrollWidth;
      el.style.fontSize = fontSize;
      el.style.whiteSpace = whiteSpace;

      const avail = room.clientWidth - 1; // scrollWidth rounds; keep a pixel spare
      setSize(
        natural <= avail ? NAME_PX : Math.max(MIN_NAME_PX, Math.floor(((NAME_PX * avail) / natural) * 2) / 2),
      );
    };

    fit();
    // Absent in jsdom and before iOS 13.4; the first fit still holds there.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    observer?.observe(room);
    let live = true;
    void document.fonts?.ready.then(() => live && fit());
    return () => {
      live = false;
      observer?.disconnect();
    };
  }, [ref, text]);

  return size;
}

/**
 * One side of the matchup, flexing to fill the height left below the panel so
 * Pick entry fits 390x740 without scrolling.
 *
 * Prop names match the tile PickFlow already renders, so it swaps in directly;
 * `record` and `side` are the additions. `record` is null until #32 wires
 * /records, and the tile simply omits the line.
 *
 * `color` comes from the caller's `matchupColors(away, home)` rather than a
 * bare `teamColor(name)` lookup here, so the underline agrees with the split
 * bars above when two primaries are too close and the panel falls back to a
 * secondary — see `src/lib/matchup-colors.ts`.
 */
export function TeamTile({
  name,
  color,
  rank,
  record = null,
  side,
  picked,
  dimmed,
  disabled = false,
  onPick,
}: {
  name: string;
  color: string;
  rank: number | null;
  record?: string | null;
  side: "home" | "away";
  picked: boolean;
  dimmed: boolean;
  disabled?: boolean;
  onPick: () => void;
}) {
  const logo = logoSrc(name);
  const label = shortSchool(name);
  const nameRef = useRef<HTMLSpanElement>(null);
  const nameSize = useFittedNameSize(nameRef, label);
  // Rank sits on the inward edge and the check on the outward one, so neither
  // collides with the "at" between the tiles.
  const inward = side === "away" ? "right-2.5" : "left-2.5";
  const outward = side === "away" ? "left-2.5" : "right-2.5";

  return (
    <button
      type="button"
      aria-pressed={picked}
      disabled={disabled}
      onClick={onPick}
      className={`relative flex min-h-[124px] min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded-xl px-2.5 py-3 text-center transition-colors disabled:opacity-70 ${
        picked
          ? "border-2 border-primary bg-primary text-primary-foreground"
          : `border border-border bg-card ${dimmed ? "text-muted-foreground" : "text-foreground"}`
      }`}
    >
      {rank ? (
        <span
          className={`absolute top-2.5 ${inward} rounded-full px-2 py-0.5 font-display text-base leading-5 ${
            picked ? "bg-primary-foreground text-primary" : "bg-muted text-foreground"
          } ${dimmed ? "opacity-70" : ""}`}
        >
          #{rank}
        </span>
      ) : null}

      {picked ? (
        <span
          className={`absolute top-2.5 ${outward} grid size-7 place-items-center rounded-full bg-primary-foreground text-primary`}
        >
          <Check size={18} strokeWidth={3} />
        </span>
      ) : null}

      {/* The badge row ends 38px inside the border (the 28px check at top-2.5),
          so the logo's box starts at 42px: pt-3 plus mt-[30px]. A tight-cropped
          logo fills its whole box, and a box reaching into that row runs it
          into the badges. min-h-8 keeps the logo from vanishing behind a
          two-line name on a short screen; the page scrolls a little there
          instead. */}
      <span className="relative mx-1 mt-[30px] mb-2 min-h-8 flex-1 self-stretch">
        {logo ? (
          <Image
            src={logo}
            alt=""
            fill
            unoptimized
            sizes="160px"
            className={`object-contain ${dimmed ? "opacity-60" : ""}`}
            style={picked ? { filter: "drop-shadow(0 2px 6px rgba(0,0,0,.35))" } : undefined}
          />
        ) : null}
      </span>

      <span className="grid w-full justify-items-center gap-1.5">
        <span ref={nameRef} className="font-display leading-[26px] text-balance" style={{ fontSize: nameSize }}>
          {label}
        </span>
        <span
          aria-hidden
          className={`block h-1.5 w-[70%] rounded-full ${dimmed ? "opacity-50" : ""}`}
          style={{
            background: color,
            boxShadow: picked ? "0 0 0 2px var(--primary-foreground)" : undefined,
          }}
        />
        {record ? (
          <span
            className={`text-[13px] font-bold tabular-nums ${
              picked ? "text-primary-foreground" : "text-muted-foreground"
            } ${dimmed ? "opacity-70" : ""}`}
          >
            {record}
          </span>
        ) : null}
      </span>
    </button>
  );
}
