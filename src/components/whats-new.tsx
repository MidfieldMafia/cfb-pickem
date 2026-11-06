"use client";

import { AtSign, Bell, Megaphone, Timer, Trophy, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, type MouseEvent } from "react";
import { Button, MENU_ROW, SECTION_LABEL } from "@saturday-slate/design-system";
import { hasSeen, markSeen, WHATS_NEW_OPEN } from "@/lib/whats-new";

/**
 * The current What's new entry, written each week by the changelog routine
 * (`.claude/skills/weekly-changelog/SKILL.md`) alongside the CHANGELOG's. A new
 * `id` shows the modal once more to every browser; the copy is the shortlist
 * of the CHANGELOG's What's new rather than a copy of it.
 */
const ENTRY: { id: string; label: string; items: { icon: LucideIcon; title: string; body: string }[] } = {
  id: "2026-11-01",
  label: "What's new · Nov 1–7",
  items: [
    {
      icon: Bell,
      title: "Notifications in Settings",
      body: "Settings has one switch for pushes on this phone, and a row for each kind of push. Remind me before picks lock now starts on.",
    },
    {
      icon: AtSign,
      title: "Mentions in Chat",
      body: "Type @ in Chat to mention someone, or @everyone. You get a push when you're mentioned, or for every message if you choose All in Settings.",
    },
    {
      icon: Timer,
      title: "Close games",
      body: "A push when a game on the Slate is one score apart in its last two minutes. Tap it to open that game on the Live Board.",
    },
    {
      icon: Trophy,
      title: "Who won the Week",
      body: "Once your Group's Week is settled, a push tells you who took the Weekly Win.",
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
