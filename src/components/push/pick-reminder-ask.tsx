"use client";

import { Bell, BellOff, Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  LocalTime,
  Switch,
  Wordmark,
} from "@saturday-slate/design-system";

import { track } from "@/lib/analytics/analytics";
import { closeSheet, hideBanner, stillHere } from "@/lib/install/nudge";
import { isInstalled } from "@/lib/install/install";
import { deviceFacts } from "@/lib/push/device";
import { chooseAsk, leaveStep, REMINDER_ASK_KEY, type Ask } from "@/lib/push/ask";
import { turnOnReminder } from "./turn-on-reminder";

/** How often an open Picks screen tells the visit it is still going. */
const STILL_HERE_MS = 60_000;

const storage = () => window.localStorage;

/** Marks the sheet's own dialog, so looking for another pop-up never finds it. */
const SHEET_ATTR = "data-reminder-ask";

/** Another pop-up on screen (What's new, a Welcome Tour card, any sheet): the first-open sheet never opens over one. */
function otherPopupShowing(): boolean {
  return [...document.querySelectorAll("dialog[open], [aria-modal='true']")].some(
    (popup) => !popup.closest(`[${SHEET_ATTR}]`),
  );
}

/** How the member's answer came out: the ask is replaced by one of these. */
type Result = "on" | "denied" | "error";

const RESULT_COPY = {
  on: { title: "Reminders are on", line: "Turn them off any time in Settings." },
  denied: { title: "Notifications are off", line: "Allow them in iPhone Settings." },
} as const;

/** Runs the one subscribe path from a tap, and reports how it ended. */
async function ask(publicKey: string): Promise<{ result: Result; message?: string }> {
  const turned = await turnOnReminder(publicKey);
  if (turned.ok) return { result: "on" };
  return turned.why === "denied" ? { result: "denied" } : { result: "error", message: turned.message };
}

/**
 * The Pick reminder ask (#482), for a member in the Home Screen app whose
 * reminder is off and whose device can take push: the first-open sheet (A1),
 * the banner on later visits (A2), and for a new member the "One last step"
 * page (B) on the app's first open. `@/lib/push/ask` decides which. Mounted
 * between the header and the progress strip, like the Home Screen nudge, which
 * it never shows with: that one is for Safari, this one for the app.
 *
 * `open` is false once the Deadline has passed; `banner` is false on the Lock of
 * the Week and Tiebreaker Guess pages, which keep their room.
 */
export function PickReminderAsk({
  open,
  banner,
  on,
  publicKey,
  onboarding,
  weekNumber,
  deadline,
}: {
  open: boolean;
  banner: boolean;
  on: boolean;
  publicKey: string | null;
  onboarding: boolean;
  weekNumber: number;
  deadline: string;
}) {
  // `count` bumps on every decision, so a return to the tab that lands on a
  // form again counts as a new appearance.
  const [{ shown, count }, setDecision] = useState<{ shown: Ask; count: number }>({ shown: null, count: 0 });
  const setShown = (next: Ask) => setDecision((current) => ({ shown: next, count: current.count }));
  // Set once the member has answered: the ask stays on its result card, and no
  // later visit check replaces it, since `on` is the server's word from page load.
  const [result, setResult] = useState<Result | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // What is actually drawn: nothing after the Deadline or without a key, and no banner on the game pages.
  const form = !open || publicKey === null ? null : shown === "banner" && !banner ? null : shown;
  useEffect(() => {
    if (form) track("reminder_ask_shown", { form });
  }, [form, count]);

  useEffect(() => {
    if (!isInstalled()) return;
    const decide = () => {
      setDecision((current) => {
        if (current.shown === "step") return current;
        return {
          shown: chooseAsk(
            storage,
            new Date(),
            { reminderOn: on, hasKey: publicKey !== null, onboarding, device: deviceFacts() },
            otherPopupShowing(),
          ),
          count: current.count + 1,
        };
      });
    };
    // After the rest of this render's effects: What's new opens its dialog in
    // its own, which runs after this one, and the sheet must see it.
    const first = setTimeout(decide, 0);
    const tick = setInterval(() => stillHere(storage, new Date(), REMINDER_ASK_KEY), STILL_HERE_MS);
    const onVisibility = () =>
      document.visibilityState === "visible" ? decide() : stillHere(storage, new Date(), REMINDER_ASK_KEY);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(first);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [on, publicKey, onboarding]);

  if (!open || shown === null || publicKey === null) return null;

  const turnOn = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const answered = await ask(publicKey);
      track("reminder_turn_on", { source: shown, result: answered.result });
      setResult(answered.result);
      setMessage(answered.message ?? null);
    } finally {
      setBusy(false);
    }
  };

  // Closing without an answer; once the answer has gone out as `reminder_turn_on`, closing is not a dismissal.
  const trackDismissed = (from: "step" | "sheet" | "banner") => {
    if (result === null) track("reminder_ask_dismissed", { form: from });
  };

  const dismissSheet = () => {
    trackDismissed("sheet");
    closeSheet(storage, REMINDER_ASK_KEY);
    setShown(null);
  };

  if (shown === "step") {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
        <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-6 px-4 pt-10 pb-8">
          <Wordmark />
          <div className="flex flex-col gap-2">
            <h1 className="m-0 font-display text-4xl leading-10">One last step</h1>
            <p className="m-0 text-base text-muted-foreground">
              Get your Pick reminder as a notification before picks lock.
            </p>
          </div>
          {result === "on" || result === "denied" ? (
            <ResultCard result={result} />
          ) : (
            <ReminderRow checked={false} busy={busy} onTurnOn={turnOn} error={result === "error" ? message : null} />
          )}
          <div className="mt-auto flex flex-col items-center gap-2 pt-4">
            <Button
              size="lg"
              className="tap w-full"
              onClick={() => {
                trackDismissed("step");
                leaveStep(storage);
                setShown(null);
              }}
            >
              Start picking
            </Button>
            <p className="m-0 text-sm text-muted-foreground">
              Week {weekNumber} picks lock <LocalTime at={deadline} style="slot" />.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (shown === "sheet") {
    const answered = result === "on" || result === "denied" ? result : null;
    return (
      <Drawer open onOpenChange={(stillOpen) => (stillOpen ? null : dismissSheet())}>
        <DrawerContent {...{ [SHEET_ATTR]: "" }} className="mx-auto max-w-md">
          <DrawerHeader className="items-center gap-3 px-6 pt-6 pb-0 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">
              {answered === "on" ? <Check size={26} aria-hidden /> : answered === "denied" ? <BellOff size={26} aria-hidden /> : <Bell size={26} aria-hidden />}
            </span>
            <DrawerTitle className="font-display text-[22px] leading-7 font-black">
              {answered === "on"
                ? "Reminders are on"
                : answered === "denied"
                  ? "Notifications are off"
                  : "Get your Pick reminder as a notification"}
            </DrawerTitle>
            <DrawerDescription className="text-base text-muted-foreground">
              {answered === "on"
                ? "You can turn them off any time in Settings."
                : answered === "denied"
                  ? "To get your reminder, allow them in iPhone Settings › Notifications › Saturday Slate."
                  : "One notification before picks lock, only when you still have picks to make."}
            </DrawerDescription>
            {result === "error" && message ? (
              <p role="alert" className="m-0 text-sm text-destructive">
                {message}
              </p>
            ) : null}
          </DrawerHeader>
          <DrawerFooter className="mt-0 gap-1 px-4 pt-5 pb-8">
            {answered ? (
              <Button size="lg" variant={answered === "on" ? "default" : "outline"} className="tap w-full" onClick={dismissSheet}>
                {answered === "on" ? "Done" : "OK"}
              </Button>
            ) : (
              <>
                <Button size="lg" className="tap w-full" disabled={busy} onClick={turnOn}>
                  Turn on reminders
                </Button>
                <button
                  type="button"
                  onClick={dismissSheet}
                  className="min-h-tap text-sm font-semibold underline underline-offset-[3px]"
                >
                  Not now
                </button>
              </>
            )}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  if (!banner) return null;

  const dismissResult = () => setShown(null);
  return (
    <div className="px-4 pt-1">
      {result === "on" || result === "denied" ? (
        <ResultCard result={result} onClose={dismissResult} />
      ) : (
        <ReminderRow
          checked={false}
          busy={busy}
          onTurnOn={turnOn}
          error={result === "error" ? message : null}
          onClose={() => {
            trackDismissed("banner");
            hideBanner(storage, new Date(), REMINDER_ASK_KEY);
            setShown(null);
          }}
        />
      )}
    </div>
  );
}

/** The bell, the line and the switch, with an X on the banner and none on the onboarding page. */
function ReminderRow({
  checked,
  busy,
  onTurnOn,
  onClose,
  error,
}: {
  checked: boolean;
  busy: boolean;
  onTurnOn: () => void;
  onClose?: () => void;
  error: string | null;
}) {
  return (
    <section aria-label="Pick reminder" className="flex flex-col gap-1">
      <div className="flex min-h-14 items-center gap-2.5 rounded-xl border border-border bg-card pl-3">
        <Bell size={20} className="shrink-0 text-primary" aria-hidden />
        <p id="reminder-ask-label" className="m-0 min-w-0 flex-1 text-sm leading-5 font-bold whitespace-nowrap">
          Remind me before picks lock
        </p>
        <Switch
          checked={checked}
          onCheckedChange={(next) => (next ? onTurnOn() : undefined)}
          aria-busy={busy}
          aria-labelledby="reminder-ask-label"
        />
        {onClose ? (
          <button
            type="button"
            aria-label="Not now"
            onClick={onClose}
            className="grid size-tap shrink-0 place-items-center text-muted-foreground"
          >
            <X size={16} aria-hidden />
          </button>
        ) : (
          <span className="w-1" aria-hidden />
        )}
      </div>
      {error ? (
        <p role="alert" className="m-0 px-3 text-sm leading-5 text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/** The row, replaced in place by how the answer went. */
function ResultCard({ result, onClose }: { result: "on" | "denied"; onClose?: () => void }) {
  const { title, line } = RESULT_COPY[result];
  const Icon = result === "on" ? Check : BellOff;
  return (
    <section aria-label="Pick reminder" className="flex min-h-14 items-center gap-2.5 rounded-xl border border-border bg-card py-1.5 pl-3">
      <Icon size={20} className="shrink-0 text-primary" aria-hidden />
      <div className="grid min-w-0 flex-1">
        <span className="text-sm leading-[18px] font-bold">{title}</span>
        <span className="truncate text-[13px] leading-[18px] text-muted-foreground">{line}</span>
      </div>
      {onClose ? (
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="grid size-tap shrink-0 place-items-center text-muted-foreground"
        >
          <X size={16} aria-hidden />
        </button>
      ) : null}
    </section>
  );
}
