"use client";

import { AtSign, Users } from "lucide-react";
import { Pennant } from "@/components/pennant";
import { mentionLabel, mentionSegments, type MentionMatch } from "@/lib/chat/mentions";
import { plural } from "@/lib/plural";
import type { MemberJson } from "@/lib/slate/json";

/** The picker's list, for the composer's `aria-controls`. */
export const MENTION_LIST_ID = "chat-mention-list";
export const mentionOptionId = (index: number) => `chat-mention-option-${index}`;

/**
 * The picker (#525, board A): a list directly above the composer, in the
 * Chat's flex column, so the thread shrinks rather than being covered. Four
 * 44px rows show, then it scrolls. A row's pointer-down is prevented, so the
 * input never blurs and the iOS keyboard stays up.
 */
export function MentionPicker({
  matches,
  active,
  people,
  onPick,
}: {
  matches: MentionMatch[];
  /** The row the arrow keys are on. */
  active: number;
  people: ReadonlyMap<number, MemberJson>;
  onPick: (match: MentionMatch) => void;
}) {
  return (
    <div id={MENTION_LIST_ID} role="listbox" aria-label="Mention a Member" className="max-h-44 shrink-0 overflow-y-auto border-t border-border bg-card">
      {matches.map((match, index) => {
        const person = match.target === "everyone" ? undefined : people.get(match.target);
        const { start, end } = match.hit;
        return (
          <button
            key={String(match.target)}
            id={mentionOptionId(index)}
            type="button"
            role="option"
            aria-selected={index === active}
            tabIndex={-1}
            onPointerDown={(event) => event.preventDefault()}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(match)}
            className={`flex h-11 w-full items-center gap-2.5 px-4 text-left text-base text-foreground ${index === active ? "bg-muted" : ""}`}
          >
            {match.target === "everyone" ? (
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted" aria-hidden>
                <Users size={16} />
              </span>
            ) : (
              <span className="flex w-7 shrink-0" aria-hidden>
                <Pennant avatarId={person?.avatarId ?? null} name={match.name} size={28} />
              </span>
            )}
            <span className="min-w-0 flex-1 truncate">
              {match.target === "everyone" ? "@" : null}
              {match.name.slice(0, start)}
              <b>{match.name.slice(start, end)}</b>
              {match.name.slice(end)}
            </span>
            {match.role ? <span className="text-[13px] leading-[18px] text-muted-foreground">{match.role}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A message's text with its mentions as names (#525): bold pine in someone
 * else's bubble, bold and underlined in the viewer's own pine one. A Member
 * the thread does not know reads as `@former member`.
 */
export function MessageText({ text, people, mine }: { text: string; people: ReadonlyMap<number, MemberJson>; mine: boolean }) {
  const nameOf = (id: number) => people.get(id)?.displayName;
  return mentionSegments(text).map((segment, index) =>
    segment.kind === "text" ? (
      segment.text
    ) : (
      <span key={index} className={mine ? "font-bold underline underline-offset-[3px]" : "font-bold text-primary"}>
        {mentionLabel(segment.target, nameOf)}
      </span>
    ),
  );
}

/** The label a message that mentions the viewer carries beside the name and time. */
export function MentionedYou() {
  return <span className="ml-1 text-xs leading-4 font-bold tracking-[0.08em] text-secondary uppercase">Mentioned you</span>;
}

/**
 * The rust pill, 12px above the foot of the thread, that jumps to the oldest
 * unseen mention. The pill is 36px, as on the board; the button around it
 * keeps the app's 44px tap floor, so it starts 4px lower.
 */
export function MentionPill({ count, onJump }: { count: number; onJump: () => void }) {
  return (
    <button type="button" onClick={onJump} className="absolute bottom-2 left-1/2 flex h-11 -translate-x-1/2 items-center">
      <span className="flex h-9 items-center gap-1.5 rounded-full bg-secondary pr-3.5 pl-2.5 text-sm font-bold whitespace-nowrap text-secondary-foreground">
        <AtSign size={16} aria-hidden />
        {plural(count, "mention")}
      </span>
    </button>
  );
}
