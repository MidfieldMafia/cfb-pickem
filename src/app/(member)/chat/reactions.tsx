"use client";

import { useEffect, useRef } from "react";
import { Ellipsis } from "lucide-react";
import type { ChatMessageJson } from "@/lib/chat/json";
import { CHAT_REACTION_LABELS, chatReactionKinds, type ChatReactionKind } from "@/lib/chat/reactions";

/**
 * Reactions on the Chat thread (#249), as board 5 of the #177 canvas draws
 * them: the tray under a tapped message, and the chips under any message that
 * has one. Each glyph is solid, in its own chart colour; on the viewer's own
 * reaction it sits cream on pine.
 */

/** The glyph's colour off the viewer's own reaction. */
const ACCENT: Record<ChatReactionKind, string> = {
  flag: "text-chart-3",
  hot: "text-chart-2",
  respect: "text-chart-1",
  ha: "text-chart-4",
};

/**
 * One reaction's glyph, copied from board 5. `cut` is the colour of the lines
 * drawn through the solid shape (the pennant's fold, the thumb's cuff, the
 * face), which has to match whatever the glyph sits on.
 */
function ReactionIcon({ kind, size, on }: { kind: ChatReactionKind; size: number; on: boolean }) {
  const cut = on ? "var(--primary)" : "var(--card)";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={`shrink-0 ${on ? "text-primary-foreground" : ACCENT[kind]}`}
    >
      {kind === "flag" ? (
        <g transform="rotate(-30 12 12)">
          <circle cx="12" cy="4.6" r="3.1" fill="currentColor" />
          <rect x="10.6" y="7.2" width="2.8" height="2.2" rx=".6" fill="currentColor" />
          <path
            d="M10.6 9.2C9 12 6.6 15 3.6 18.2c1.8.8 3.5.6 5 1.6 1.2.8 2.4 1.4 3.8 1.2 1.6-.4 3-1.8 4.6-1.4 1.6.4 2.8-.2 4-1.4-3-2.6-5.4-6-6.6-9Z"
            fill="currentColor"
          />
          <path d="M12 10.4v10" stroke={cut} strokeWidth="1.1" strokeLinecap="round" />
        </g>
      ) : kind === "hot" ? (
        <path
          fill="currentColor"
          d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
        />
      ) : kind === "respect" ? (
        <>
          <path
            d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"
            fill="currentColor"
          />
          <path d="M7 10.5v11" stroke={cut} strokeWidth="1.6" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="10" fill="currentColor" />
          <path d="M17 13.2a5 5 0 0 1-10 0h10Z" fill={cut} />
          <circle cx="9" cy="9.3" r="1.3" fill={cut} />
          <circle cx="15" cy="9.3" r="1.3" fill={cut} />
        </>
      )}
    </svg>
  );
}

/** "Ha 2, including yours; Flag 1": what the chips say to a screen reader. */
function tally(message: ChatMessageJson): string {
  return message.reactions
    .map(({ kind, count }) => `${CHAT_REACTION_LABELS[kind]} ${count}${message.mine === kind ? ", including yours" : ""}`)
    .join("; ");
}

/** The counts under a message; nothing when nobody has reacted. */
export function ReactionChips({ message, mine }: { message: ChatMessageJson; mine: boolean }) {
  if (message.reactions.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${mine ? "justify-end pr-1" : "pl-1"}`}>
      <span className="sr-only">Reactions: {tally(message)}</span>
      {message.reactions.map(({ kind, count }) => {
        const on = message.mine === kind;
        return (
          <span
            key={kind}
            aria-hidden
            className={`inline-flex h-6 items-center gap-[3px] rounded-full border px-2 text-xs font-bold tabular-nums ${
              on ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground"
            }`}
          >
            <ReactionIcon kind={kind} size={12} on={on} />
            {count}
          </span>
        );
      })}
    </div>
  );
}

/**
 * The tray under a tapped message: the four reactions, the viewer's own
 * filled, then More when it has something in it (#250). The viewer's own
 * message takes no reaction from them, so its tray is More alone. Escape
 * closes it. It scrolls itself into view on opening, since the message tapped
 * is often the last one, with the composer just below.
 */
export function ReactionTray({
  message,
  mine,
  onPick,
  onMore,
  onClose,
}: {
  message: ChatMessageJson;
  /** The viewer's own message: no reactions, only More. */
  mine: boolean;
  onPick: (kind: ChatReactionKind) => void;
  /** Opens Delete or Remove; undefined when the viewer may do neither, and More is left out. */
  onMore: (() => void) | undefined;
  onClose: () => void;
}) {
  const tray = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tray.current?.scrollIntoView({ block: "nearest" });
  }, []);

  return (
    <div
      ref={tray}
      role="group"
      aria-label={mine ? "Your message" : "React to this message"}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className={`mt-0.5 flex gap-0.5 rounded-[14px] border border-border bg-popover p-1 ${mine ? "self-end" : "self-start"}`}
    >
      {mine
        ? null
        : chatReactionKinds.map((kind) => {
            const on = message.mine === kind;
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={on}
                onClick={() => onPick(kind)}
                className={`flex h-12 w-[60px] flex-col items-center justify-center gap-0.5 rounded-md text-[11px] font-bold whitespace-nowrap ${
                  on ? "bg-primary text-primary-foreground" : "text-foreground"
                }`}
              >
                <ReactionIcon kind={kind} size={18} on={on} />
                {CHAT_REACTION_LABELS[kind]}
              </button>
            );
          })}
      {onMore ? (
        <button
          type="button"
          onClick={onMore}
          aria-label={mine ? "More: delete this message" : "More: remove this message"}
          className="flex h-12 w-[52px] flex-col items-center justify-center gap-0.5 rounded-md text-[11px] font-bold text-muted-foreground"
        >
          <Ellipsis size={18} aria-hidden />
          More
        </button>
      ) : null}
    </div>
  );
}
