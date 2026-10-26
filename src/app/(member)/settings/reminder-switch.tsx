"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { LINK, Switch } from "@saturday-slate/design-system";
import { track } from "@/lib/analytics/analytics";
import { deviceFacts, pushBlock, unsubscribeDevice, type PushBlock } from "@/lib/push/device";
import { turnOnReminder } from "@/components/push/turn-on-reminder";
import { turnOffReminderAction } from "./actions";

const FOOTNOTE: Record<PushBlock | "stopped", string> = {
  home_screen: "Works from the Home Screen app.",
  computer: "Turn this on in the app on your phone.",
  denied: "Blocked in iPhone Settings › Notifications.",
  stopped: "Stopped reaching your phone, so it turned off.",
};

const noChange = () => () => {};
/** What blocks push here, read once in the browser; "unknown" while the server renders. */
const readBlock = () => pushBlock(deviceFacts()) ?? "none";
const serverBlock = () => "unknown" as const;

/**
 * The Pick reminder row (#454): one switch, and a footnote only when something
 * stops push on this device or push stopped reaching the member. Turning it on
 * asks for permission inside the tap, with no pre-prompt: Allow saves Push and
 * this device, Don't Allow saves nothing and shows the blocked footnote.
 * Turning it off deletes every device the member has. Off is available
 * anywhere; on only where push can arrive.
 */
export function ReminderSwitch({ on: savedOn, stopped: savedStopped, publicKey }: { on: boolean; stopped: boolean; publicKey: string | null }) {
  const read = useSyncExternalStore(noChange, readBlock, serverBlock);
  const [on, setOn] = useState(savedOn);
  const [stopped, setStopped] = useState(savedStopped);
  const [deniedNow, setDeniedNow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const block: PushBlock | null = deniedNow ? "denied" : read === "none" || read === "unknown" ? null : read;
  const unavailable = !on && (block !== null || publicKey === null);
  const footnote = on ? null : block ? FOOTNOTE[block] : stopped ? FOOTNOTE.stopped : null;

  async function flip(next: boolean) {
    if (busy || read === "unknown") return;
    setBusy(true);
    setError(null);
    try {
      if (!next) {
        await turnOffReminderAction();
        await unsubscribeDevice();
        setOn(false);
        setStopped(false);
        return;
      }
      if (!publicKey) return;
      const turned = await turnOnReminder(publicKey);
      track("reminder_turn_on", { source: "settings", result: turned.ok ? "on" : turned.why });
      if (!turned.ok) {
        if (turned.why === "denied") setDeniedNow(true);
        else setError(turned.message);
        return;
      }
      setOn(true);
      setStopped(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-4 flex flex-col gap-2">
      <div className="flex min-h-14 items-center gap-3 rounded-[14px] border border-border bg-card pr-1 pl-3">
        <Bell size={20} className="shrink-0 text-primary" aria-hidden />
        <p id="reminder-label" className="min-w-0 flex-1 text-base leading-6 font-semibold">
          Remind me before picks lock
        </p>
        <Switch checked={on} onCheckedChange={flip} disabled={unavailable} aria-busy={busy} aria-labelledby="reminder-label" />
      </div>
      {footnote ? <p className="px-3 text-sm leading-5 text-muted-foreground">{footnote}</p> : null}
      {!on && block === "home_screen" ? (
        <Link href="/install" className={`${LINK} -mt-3 self-start px-3`}>
          Add it to your Home Screen
        </Link>
      ) : null}
      {error ? (
        <p role="alert" className="px-3 text-sm leading-5 text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
