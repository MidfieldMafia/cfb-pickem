"use client";

import { CircleAlert } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import {
  BackLink,
  Button,
  Pennant,
  PENNANT_FLAG_COLORS,
  PENNANT_MARK_COLORS,
  PENNANT_PATTERNS,
  PENNANT_POLES,
  PENNANT_TINT,
  pennantColor,
  pennantPattern,
  type PennantColor,
  type PennantDesign,
} from "@saturday-slate/design-system";

import { findAvatar, ownAvatarId } from "@/lib/avatars";

/**
 * "Make your own", the picker's third level under Flags (#398). A pinned
 * preview at 96, and at 28 and 20 because those are the leaderboard's and
 * chat's real sizes, over five settings in one scroll.
 *
 * Nothing here is stored. Done hands the design back to the picker, which
 * chooses it; the page's own Save commits it, the way a photo crop does. Back
 * drops whatever was changed since the maker opened.
 */
export function PennantMaker({
  initial,
  editing,
  onDone,
  onBack,
}: {
  initial: PennantDesign;
  /** The member already has a design, which `initial` is. */
  editing: boolean;
  onDone: (design: PennantDesign) => void;
  onBack: () => void;
}) {
  const [design, setDesign] = useState(initial);
  const set = <K extends keyof PennantDesign>(key: K, value: PennantDesign[K]) =>
    setDesign((d) => ({ ...d, [key]: value }));
  const preview = findAvatar(ownAvatarId(design));
  const clash = design.patternColor === design.flag && design.pattern !== "plain";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <BackLink onClick={onBack}>
          <span className="sr-only">Back to Flags</span>
        </BackLink>
        <span className="font-semibold">Make your own</span>
        <span className="ml-auto text-xs text-muted-foreground">{editing ? "Editing yours" : "New"}</span>
      </div>

      {/* Pinned, so every setting is judged against the flag it changes. */}
      <div className="sticky top-0 z-10 -mx-1 bg-background px-1 pb-1">
        <div className="flex items-center gap-4 rounded-xl border bg-card p-3">
          <Pennant avatar={preview} size={96} />
          <div className="flex items-center gap-2.5">
            <Pennant avatar={preview} size={28} />
            <Pennant avatar={preview} size={20} />
            <span className="text-xs text-muted-foreground">Board, chat</span>
          </div>
        </div>
      </div>

      <Setting title="Flag color" value={pennantColor(design.flag).name} columns={7}>
        {PENNANT_FLAG_COLORS.map((c) => (
          <Swatch key={c.slug} color={c} chosen={design.flag === c.slug} onChoose={() => set("flag", c.slug)} />
        ))}
      </Setting>

      <Setting title="Pattern" value={pennantPattern(design.pattern).name} columns={6} gap="gap-1">
        {PENNANT_PATTERNS.map((p) => {
          const chosen = design.pattern === p.slug;
          return (
            <button
              key={p.slug}
              type="button"
              onClick={() => set("pattern", p.slug)}
              aria-pressed={chosen}
              aria-label={p.name}
              className={`flex items-center justify-center justify-self-center rounded-full border-2 p-[3px] ${
                chosen ? "border-primary" : "border-transparent"
              }`}
            >
              <Pennant avatar={findAvatar(ownAvatarId({ ...design, pattern: p.slug }))} size={40} />
            </button>
          );
        })}
      </Setting>

      <Setting title="Pattern color" value={pennantColor(design.patternColor).name} columns={5}>
        {PENNANT_MARK_COLORS.map((c) => (
          <Swatch key={c.slug} color={c} chosen={design.patternColor === c.slug} onChoose={() => set("patternColor", c.slug)} />
        ))}
      </Setting>
      {clash ? (
        <p role="status" className="-mt-2 flex gap-2 text-sm text-muted-foreground">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          Same as the flag, so the pattern won’t show.
        </p>
      ) : null}

      <Setting title="Pole" value={pennantColor(design.pole).name} columns={7}>
        {PENNANT_POLES.map((c) => (
          <Swatch key={c.slug} color={c} chosen={design.pole === c.slug} onChoose={() => set("pole", c.slug)} />
        ))}
      </Setting>

      <Setting
        title="Background"
        value={design.bg === "auto" ? "Matches the flag" : pennantColor(design.bg).name}
        columns={5}
      >
        <Swatch
          color={{ slug: "auto", name: "Match the flag", hex: tint(pennantColor(design.flag).hex) }}
          chosen={design.bg === "auto"}
          onChoose={() => set("bg", "auto")}
        >
          Auto
        </Swatch>
        {PENNANT_FLAG_COLORS.map((c) => (
          <Swatch
            key={c.slug}
            color={{ ...c, name: `${c.name} tint`, hex: tint(c.hex) }}
            chosen={design.bg === c.slug}
            onChoose={() => set("bg", c.slug)}
          />
        ))}
      </Setting>

      <Button type="button" size="lg" className="w-full" onClick={() => onDone(design)}>
        Done
      </Button>
    </div>
  );
}

/** A background as the disc shows it: the color at the disc's tint over the card. */
function tint(hex: string): string {
  return `color-mix(in srgb, ${hex} ${PENNANT_TINT * 100}%, var(--card))`;
}

/** One setting, headed `SETTING · <current value>`, over its grid of choices. */
function Setting({
  title,
  value,
  columns,
  gap = "gap-0.5",
  children,
}: {
  title: string;
  value: string;
  columns: number;
  gap?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h3 id={id} className="text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase">
        {title} · {value}
      </h3>
      <div className={`grid ${gap}`} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {children}
      </div>
    </section>
  );
}

/**
 * A 32px swatch in a 44px tap target. The chosen one gets a paper gap and a
 * pine ring; the rest a faint inset edge, so Cream still shows on the paper.
 */
function Swatch({
  color,
  chosen,
  onChoose,
  children,
}: {
  color: PennantColor;
  chosen: boolean;
  onChoose: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onChoose}
      aria-pressed={chosen}
      aria-label={color.name}
      className="flex h-11 items-center justify-center"
    >
      <span
        aria-hidden
        className={`flex size-8 items-center justify-center rounded-full text-[10px] font-bold text-foreground ${
          chosen
            ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
            : "ring-1 ring-foreground/20 ring-inset"
        }`}
        style={{ background: color.hex }}
      >
        {children}
      </span>
    </button>
  );
}
