"use client";

import Image from "next/image";
import { Check } from "lucide-react";
import { logoSrc, teamColor } from "@/lib/logos";

/**
 * One side of the matchup, flexing to fill the height left below the panel so
 * Pick entry fits 390x740 without scrolling.
 *
 * Prop names match the tile PickFlow already renders, so it swaps in directly;
 * `record` and `side` are the additions. `record` is null until #32 wires
 * /records, and the tile simply omits the line.
 */
export function TeamTile({
  name,
  rank,
  record = null,
  side,
  picked,
  dimmed,
  disabled = false,
  onPick,
}: {
  name: string;
  rank: number | null;
  record?: string | null;
  side: "home" | "away";
  picked: boolean;
  dimmed: boolean;
  disabled?: boolean;
  onPick: () => void;
}) {
  const logo = logoSrc(name);
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

      <span className="relative mx-1 my-2 min-h-0 flex-1 self-stretch">
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
        <span className="font-display text-[22px] leading-[26px] text-balance">{name}</span>
        <span
          aria-hidden
          className={`block h-1.5 w-[70%] rounded-full ${dimmed ? "opacity-50" : ""}`}
          style={{
            background: teamColor(name),
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
