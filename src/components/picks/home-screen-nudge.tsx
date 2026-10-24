"use client";

import Link from "next/link";
import { Bell, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@saturday-slate/design-system";

import { isInstalled, readBrowser } from "@/lib/install/install";
import { closeSheet, hideBanner, openPicks, stillHere, type Nudge } from "@/lib/install/nudge";

/** How often an open Picks screen tells the visit it is still going. */
const STILL_HERE_MS = 60_000;

const storage = () => window.localStorage;

/** Marks the sheet's own dialog, so looking for another pop-up never finds it. */
const SHEET_ATTR = "data-home-screen-nudge";

/**
 * Whether another pop-up is on screen: What's new is a `<dialog>`, and a
 * Welcome Tour card or any other sheet is a modal dialog role. The sheet never
 * opens over one (#455).
 */
function otherPopupShowing(): boolean {
  return [...document.querySelectorAll("dialog[open], [aria-modal='true']")].some(
    (popup) => !popup.closest(`[${SHEET_ATTR}]`),
  );
}

/**
 * The Home Screen nudge (#455), for a member in Safari on iPhone who has not
 * put the app on their Home Screen: a bottom sheet the first time, then a
 * banner here at the top of Picks on every later visit. `@/lib/install/nudge`
 * decides which. Mounted between the header and the progress strip.
 *
 * `open` is false once the Deadline has passed, and hides both. `banner` is
 * false on the Lock of the Week and Tiebreaker Guess pages, which keep their
 * room: the banner belongs to the game screens.
 */
export function HomeScreenNudge({ open, banner }: { open: boolean; banner: boolean }) {
  const [nudge, setNudge] = useState<Nudge>(null);

  useEffect(() => {
    if (readBrowser(navigator.userAgent).phone !== "ios" || isInstalled()) return;
    const decide = () => setNudge(openPicks(storage, new Date(), { popupShowing: otherPopupShowing() }));
    // After the rest of this render's effects: What's new opens its dialog in
    // its own, which runs after this one, and the sheet must see it.
    const first = setTimeout(decide, 0);
    const tick = setInterval(() => stillHere(storage, new Date()), STILL_HERE_MS);
    // Back from another app: a new visit if it was away long enough. Leaving
    // stamps the time, so the time away is counted from then.
    const onVisibility = () => (document.visibilityState === "visible" ? decide() : stillHere(storage, new Date()));
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(first);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (!open) return null;

  const dismissSheet = () => {
    closeSheet(storage);
    setNudge(null);
  };

  if (nudge === "sheet") {
    return (
      <Drawer open onOpenChange={(stillOpen) => (stillOpen ? null : dismissSheet())}>
        <DrawerContent {...{ [SHEET_ATTR]: "" }} className="mx-auto max-w-md">
          <DrawerHeader className="items-center gap-3 px-6 pt-6 pb-0 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">
              <Bell size={26} aria-hidden />
            </span>
            <DrawerTitle className="font-display text-[22px] leading-7 font-black">
              Get your reminder as a notification
            </DrawerTitle>
            <DrawerDescription className="text-base text-muted-foreground">
              Put Saturday Slate on your Home Screen to get your Pick reminder as a notification.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter className="mt-0 gap-1 px-4 pt-5 pb-8">
            <Button asChild size="lg" className="tap w-full">
              <Link href="/install" onClick={() => closeSheet(storage)}>
                Add to Home Screen
              </Link>
            </Button>
            <button
              type="button"
              onClick={dismissSheet}
              className="min-h-tap text-sm font-semibold underline underline-offset-[3px]"
            >
              Not now
            </button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  if (nudge !== "banner" || !banner) return null;

  return (
    // Hidden by CSS in an installed window too, as the install page's steps are.
    <div className="when-browser px-4 pt-1">
      <section
        aria-label="Home Screen"
        className="flex items-center gap-2.5 rounded-xl border border-border bg-card py-1.5 pl-3"
      >
        <Bell size={20} className="shrink-0 text-primary" aria-hidden />
        <div className="grid min-w-0 flex-1">
          <span className="text-sm leading-[18px] font-bold">Get your Pick reminder as a notification</span>
          <span className="text-[13px] leading-[18px] text-muted-foreground">Put Saturday Slate on your Home Screen.</span>
        </div>
        <Button asChild className="tap h-11 shrink-0">
          <Link href="/install">Add</Link>
        </Button>
        <button
          type="button"
          aria-label="Not now"
          onClick={() => {
            hideBanner(storage, new Date());
            setNudge(null);
          }}
          className="grid size-tap shrink-0 place-items-center text-muted-foreground"
        >
          <X size={16} aria-hidden />
        </button>
      </section>
    </div>
  );
}
