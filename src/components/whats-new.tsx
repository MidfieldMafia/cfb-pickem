"use client";

import { CircleHelp, Megaphone, Palette, Radio, SmilePlus, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, type MouseEvent } from "react";
import { Button, MENU_ROW, SECTION_LABEL } from "@saturday-slate/design-system";
import { hasSeen, markSeen, WHATS_NEW_OPEN } from "@/lib/whats-new";

/**
 * The current What's new entry. A new `id` shows the modal once more to every
 * browser; the copy is the week's features in the member's words, the
 * shortlist of the CHANGELOG's What's new rather than a copy of it.
 */
const ENTRY: { id: string; label: string; items: { icon: LucideIcon; title: string; body: string }[] } = {
  id: "2026-09-27",
  label: "What's new · Sep 27–Oct 3",
  items: [
    {
      icon: Radio,
      title: "More on every live game",
      body: "Live rows show the down and distance, the last play, and a football on the side with the ball.",
    },
    {
      icon: Palette,
      title: "Picks in team colours",
      body: "Once picks are revealed, each game's split bar is drawn in the two schools' colours.",
    },
    {
      icon: SmilePlus,
      title: "See who reacted",
      body: "In Chat, press and hold a reaction to see who left it. Tap one to add yours.",
    },
    {
      icon: CircleHelp,
      title: "A shorter How to play",
      body: "The rules on one page: points, your Lock, the Tiebreaker Guess and the Deadline.",
    },
  ],
};

const storage = () => window.localStorage;

/**
 * The What's new modal: opens by itself the first time this browser sees the
 * entry, and again whenever the Profile menu's row asks. Closing it any way —
 * Got it, the X, Escape — marks the entry seen.
 */
export function WhatsNew() {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const open = () => {
      if (!dialog.current?.open) dialog.current?.showModal();
    };
    if (!hasSeen(storage, ENTRY.id)) open();
    window.addEventListener(WHATS_NEW_OPEN, open);
    return () => window.removeEventListener(WHATS_NEW_OPEN, open);
  }, []);

  const close = () => dialog.current?.close();

  return (
    <dialog
      ref={dialog}
      aria-labelledby="whats-new-title"
      onClose={() => markSeen(storage, ENTRY.id)}
      className="m-auto w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-xl border border-border bg-card p-0 text-card-foreground backdrop:bg-foreground/55"
    >
      <div className="flex max-h-[calc(100dvh-6rem)] flex-col">
        <div className="flex items-start gap-2 pt-5 pr-3 pb-3 pl-5">
          <div className="grid flex-1 gap-1">
            <p className={SECTION_LABEL}>{ENTRY.label}</p>
            <h2 id="whats-new-title">New since last Saturday</h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="flex size-tap shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        <ul className="grid flex-1 gap-4 overflow-y-auto px-5 pt-1 pb-3">
          {ENTRY.items.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-primary">
                <Icon size={18} aria-hidden />
              </span>
              <div className="grid gap-0.5">
                <p className="font-bold">{title}</p>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="border-t border-border px-5 pt-3 pb-5">
          <Button size="lg" className="w-full" onClick={close}>
            Got it
          </Button>
        </div>
      </div>
    </dialog>
  );
}

/** The Profile menu's row that reopens the modal, closing the menu behind it. */
export function WhatsNewMenuRow() {
  const reopen = (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.closest("details")?.removeAttribute("open");
    window.dispatchEvent(new Event(WHATS_NEW_OPEN));
  };
  return (
    <button type="button" onClick={reopen} className={`${MENU_ROW} w-full cursor-pointer text-left`}>
      <Megaphone size={16} className="shrink-0 text-primary" aria-hidden />
      What&apos;s new
    </button>
  );
}
