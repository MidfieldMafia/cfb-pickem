"use client";

import { useEffect, useRef } from "react";
import { Ellipsis, X } from "lucide-react";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@saturday-slate/design-system";
import { Pennant } from "@/components/pennant";
import type { ChatMessageJson } from "@/lib/chat/json";
import { CHAT_REACTION_LABELS, chatReactionKinds, type ChatReactionKind, type ReactionSheetView } from "@/lib/chat/reactions";
import type { MemberJson } from "@/lib/slate/json";

/**
 * Reactions on the Chat thread (#249), as board 5 of the #177 canvas draws
 * them: the tray under a tapped message, the chips under any message that has
 * one, and the sheet of who reacted that a chip opens (#338). Each glyph is solid, in its own chart colour; on the viewer's own
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

/** How long a chip is held before it opens the sheet rather than acting as a tap. */
const HOLD_MS = 450;

/** What a chip says to a screen reader: its count, and what a tap on it does. */
function chipLabel(message: ChatMessageJson, kind: ChatReactionKind, count: number, own: boolean): string {
  const on = message.mine === kind;
  const counted = `${CHAT_REACTION_LABELS[kind]} ${count}${on ? ", including yours" : ""}`;
  if (own) return `${counted}. Tap to see who reacted`;
  if (on) return `${counted}. Tap to take yours off`;
  return `${counted}. ${message.mine ? "Tap to switch yours to it" : "Tap to add yours"}`;
}

/**
 * The counts under a message; nothing when nobody has reacted. Each chip is a
 * button (#338): a tap on someone else's message does what that reaction does
 * in the tray, and on the viewer's own opens who reacted, since they cannot
 * react to it. Holding any chip opens who reacted, and the hold does not also
 * count as a tap. The chip stays 24px to look at, with a 44px hit area.
 *
 * A hold cannot be reached from a keyboard or a screen reader, so a "See who
 * reacted" button follows the chips, hidden until it has focus.
 */
export function ReactionChips({
  message,
  mine,
  onTap,
  onShow,
}: {
  message: ChatMessageJson;
  mine: boolean;
  onTap: (kind: ChatReactionKind) => void;
  /** Opens who reacted at `kind`, or at All for null. */
  onShow: (kind: ChatReactionKind | null) => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** The chip whose hold opened the sheet: the click that ends the hold is swallowed. */
  const held = useRef<ChatReactionKind | null>(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (message.reactions.length === 0) return null;
  const release = () => clearTimeout(timer.current);
  return (
    <div role="group" aria-label="Reactions" className={`flex flex-wrap gap-1 ${mine ? "justify-end pr-1" : "pl-1"}`}>
      {message.reactions.map(({ kind, count }) => {
        const on = message.mine === kind;
        return (
          <button
            key={kind}
            type="button"
            aria-label={chipLabel(message, kind, count, mine)}
            onPointerDown={() => {
              release();
              held.current = null;
              timer.current = setTimeout(() => {
                held.current = kind;
                onShow(kind);
              }, HOLD_MS);
            }}
            onPointerUp={release}
            onPointerLeave={release}
            onPointerCancel={release}
            onContextMenu={(e) => e.preventDefault()}
            onClick={() => {
              if (held.current === kind) {
                held.current = null;
                return;
              }
              if (mine) onShow(kind);
              else onTap(kind);
            }}
            className="-my-2.5 touch-manipulation py-2.5 select-none [-webkit-touch-callout:none]"
          >
            <span
              className={`inline-flex h-6 items-center gap-[3px] rounded-full border px-2 text-xs font-bold tabular-nums ${
                on ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground"
              }`}
            >
              <ReactionIcon kind={kind} size={12} on={on} />
              {count}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => onShow(null)}
        className="sr-only rounded-full border border-border px-2 text-xs font-bold focus:not-sr-only focus:inline-flex focus:h-6 focus:items-center"
      >
        See who reacted
      </button>
    </div>
  );
}

/**
 * Who reacted to a message (#338): a sheet with a tab for All and one per
 * reaction, each listing its people newest first. The thread builds it from
 * the message as the poll last brought it (`reactionSheet`), so it follows
 * the poll while open.
 */
export function ReactionSheet({
  sheet,
  people,
  viewerId,
  onSelect,
  onClose,
}: {
  /** Null when the sheet is closed. */
  sheet: ReactionSheetView | null;
  people: Map<number, MemberJson>;
  viewerId: number;
  onSelect: (kind: ChatReactionKind | null) => void;
  onClose: () => void;
}) {
  return (
    <Drawer open={sheet !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DrawerContent className="mx-auto max-w-md">
        <DrawerHeader className="flex-row items-center justify-between py-1 pr-2 pl-5 text-left">
          <DrawerTitle className="font-display text-xl leading-6 font-black">Reactions</DrawerTitle>
          <DrawerDescription className="sr-only">Who reacted to this message, newest first.</DrawerDescription>
          <DrawerClose aria-label="Close" className="grid size-11 place-items-center text-muted-foreground">
            <X size={20} aria-hidden />
          </DrawerClose>
        </DrawerHeader>
        {sheet ? (
          <>
            <div role="tablist" aria-label="Reactions" className="flex gap-1.5 overflow-x-auto border-b border-border px-4 pt-2 pb-3">
              {sheet.tabs.map((tab) => {
                const on = sheet.selected === tab.kind;
                return (
                  <button
                    key={tab.kind ?? "all"}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    aria-label={`${tab.kind ? CHAT_REACTION_LABELS[tab.kind] : "All"} ${tab.count}`}
                    onClick={() => onSelect(tab.kind)}
                    className={`inline-flex h-9 shrink-0 items-center gap-[5px] rounded-full border px-3.5 text-sm font-bold ${
                      on ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground"
                    }`}
                  >
                    {tab.kind ? <ReactionIcon kind={tab.kind} size={14} on={on} /> : <span>All</span>}
                    <span className="tabular-nums">{tab.count}</span>
                  </button>
                );
              })}
            </div>
            <ul role="tabpanel" className="m-0 flex list-none flex-col overflow-y-auto px-5 pt-2 pb-7">
              {sheet.reactors.map(({ memberId, kind }) => {
                const you = memberId === viewerId;
                const person = people.get(memberId);
                const name = person?.displayName ?? "Someone";
                return (
                  <li key={memberId} className="flex min-h-11 items-center gap-3">
                    <Pennant avatarId={person?.avatarId ?? null} name={name} size={32} />
                    <span className={`min-w-0 flex-1 truncate text-[15px] leading-5 ${you ? "font-extrabold" : "font-semibold"}`}>
                      {you ? "You" : name}
                    </span>
                    {sheet.selected === null ? (
                      <>
                        <ReactionIcon kind={kind} size={18} on={false} />
                        <span className="sr-only">{CHAT_REACTION_LABELS[kind]}</span>
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
      </DrawerContent>
    </Drawer>
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
