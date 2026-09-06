"use client";

import { Check, Compass, Download, EllipsisVertical, SquareArrowUp, SquarePlus } from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { isInstalled, readBrowser, type Browser, type Phone } from "@/lib/install/install";

interface Step {
  Icon: ComponentType<{ className?: string }>;
  text: string;
}

/** The two platforms there are steps for. A desktop visitor is shown the iPhone ones. */
type Guided = Exclude<Phone, "other">;

const STEPS: Record<Guided, Step[]> = {
  ios: [
    { Icon: SquareArrowUp, text: "Tap the Share button at the bottom of Safari." },
    { Icon: SquarePlus, text: "Scroll down and tap “Add to Home Screen”." },
    { Icon: Check, text: "Tap Add. Saturday Slate opens like an app, no browser bar." },
  ],
  android: [
    // Spelled out rather than drawn with ⋮ — Manrope has no glyph for it and
    // the fallback renders as a cramped colon. The icon beside it carries the shape.
    { Icon: EllipsisVertical, text: "Tap the three-dot menu at the top right of Chrome." },
    { Icon: Download, text: "Tap “Add to Home screen”, then “Install”." },
    { Icon: Check, text: "Saturday Slate opens like an app, no browser bar." },
  ],
};

const TABS: { phone: Guided; label: string }[] = [
  { phone: "ios", label: "iPhone · Safari" },
  { phone: "android", label: "Android · Chrome" },
];

/** Chrome's install prompt. Not in lib.dom — it has never shipped outside Chromium. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

/** The user agent cannot change under us, so this store never notifies. */
const neverChanges = () => () => {};

/** The server has no user agent to read, so it renders the iPhone steps. */
const ON_THE_SERVER: Browser = { phone: "ios", embedded: false };

let here: Browser | null = null;

function browserHere(): Browser {
  return (here ??= readBrowser(navigator.userAgent));
}

/**
 * What to say when the steps below will not work where the member is standing.
 *
 * A Magic Link arrives by text, so the first tap usually lands in whatever
 * browser Messages embeds — and an embedded browser's share sheet often has no
 * Add to Home Screen. iOS gets this warning even when nothing proves it,
 * because the Safari View Controller that Messages uses is indistinguishable
 * from Safari itself.
 */
function reopenAdvice(phone: Guided, embedded: boolean): string | null {
  const browser = phone === "ios" ? "Safari" : "Chrome";
  if (embedded) {
    return `You’re inside another app’s browser, which has no Add to Home Screen. Tap its ••• menu and choose Open in ${browser} first.`;
  }
  if (phone === "ios") {
    return "Opened this straight from Messages? Tap ••• and choose Open in Safari first — the built-in browser may not offer Add to Home Screen.";
  }
  return null;
}

function subscribeInstalled(changed: () => void) {
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", changed);
  window.addEventListener("appinstalled", changed);
  return () => {
    media.removeEventListener("change", changed);
    window.removeEventListener("appinstalled", changed);
  };
}

/**
 * The add-to-home-screen steps for the phone the member is holding, with a
 * platform switch for when the guess is wrong.
 *
 * Nothing here can do the installing: iOS has no install API at all, and
 * Chrome's only fires on its own terms. So this is instructions plus, where
 * Chrome offers it, a shortcut to the native dialog.
 */
export function InstallGuide() {
  const detected = useSyncExternalStore(neverChanges, browserHere, () => ON_THE_SERVER);
  const installed = useSyncExternalStore(subscribeInstalled, isInstalled, () => false);
  const [chosen, setChosen] = useState<Guided | null>(null);
  const [chromePrompt, setChromePrompt] = useState<InstallPromptEvent | null>(null);

  // Chrome fires this once it considers the app installable; holding onto it
  // lets the button below open the real dialog instead of describing a menu.
  useEffect(() => {
    const held = (event: Event) => {
      event.preventDefault();
      setChromePrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", held);
    return () => window.removeEventListener("beforeinstallprompt", held);
  }, []);

  if (installed) {
    return (
      <p className="flex items-center gap-3 rounded-lg border border-primary bg-card p-3 text-base">
        <Check className="size-5 shrink-0 text-primary" aria-hidden />
        You&rsquo;re running the installed app. Nothing left to do.
      </p>
    );
  }

  const phone = chosen ?? (detected.phone === "android" ? "android" : "ios");
  const reopenIn = reopenAdvice(phone, detected.embedded);

  return (
    // Hidden by CSS in an installed window, so a standalone launch never
    // flashes these steps in the moment before hydration decides.
    <div className="when-browser space-y-4">
      <div className="flex gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.phone}
            type="button"
            aria-pressed={phone === tab.phone}
            onClick={() => setChosen(tab.phone)}
            className={`flex-1 rounded-full border px-4 text-sm font-semibold ${
              phone === tab.phone
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {reopenIn ? (
        <p className="flex items-start gap-3 rounded-lg border border-secondary bg-card p-3 text-base">
          <Compass className="mt-1 size-5 shrink-0 text-secondary" aria-hidden />
          <span>{reopenIn}</span>
        </p>
      ) : null}

      {phone === "android" && chromePrompt ? (
        <Button className="w-full" size="lg" onClick={() => void chromePrompt.prompt()}>
          Install Saturday Slate
        </Button>
      ) : null}

      <ol className="space-y-3">
        {STEPS[phone].map((step, index) => (
          <li key={step.text} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <span className="font-display text-lg font-black text-secondary">{index + 1}</span>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
              <step.Icon className="size-5" aria-hidden />
            </span>
            <span className="text-base">{step.text}</span>
          </li>
        ))}
      </ol>

      {phone === "ios" ? (
        <p className="text-sm text-muted-foreground">
          Add it from this same Safari window. The installed app copies your sign-in at the moment
          you add it, so a link opened somewhere else later would land you signed out.
        </p>
      ) : null}
    </div>
  );
}
