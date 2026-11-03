"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { LINK, Switch } from "@saturday-slate/design-system";
import { track } from "@/lib/analytics/analytics";
import { readBrowser } from "@/lib/install/install";
import { NOTE, notificationsCard } from "@/lib/push/card";
import { deviceFacts, pushBlock, thisDeviceEndpoint, unsubscribeDevice } from "@/lib/push/device";
import { turnOnReminder } from "@/components/push/turn-on-reminder";
import { saveNotificationAction, turnOffNotificationsAction } from "./actions";

const noChange = () => () => {};
/** What blocks push here and what the device is, read once in the browser; "unknown" while the server renders. */
const readBlock = () => pushBlock(deviceFacts()) ?? "none";
const readPhone = () => readBrowser(navigator.userAgent).phone;
const unknown = () => "unknown" as const;

/**
 * The Notifications card on Settings (#529, board A on #494). The header's
 * switch is per device: on means this browser's subscription is one of the
 * member's saved devices. Turning it on asks permission inside the tap, with
 * no pre-prompt, and saves this device; Don't Allow saves nothing and shows the
 * blocked note. Turning it off deletes this device only. The rows below save
 * one kind of push each, for the member on every phone, and never add or
 * delete a device. While the switch is off, every row shows off, greyed and
 * locked, so no row claims a push this phone won't get.
 */
export function NotificationsCard({
  endpoints,
  stopped: savedStopped,
  reminder: savedReminder,
  publicKey,
}: {
  /** The member's saved devices. */
  endpoints: string[];
  stopped: boolean;
  reminder: boolean;
  publicKey: string | null;
}) {
  const block = useSyncExternalStore(noChange, readBlock, unknown);
  const phone = useSyncExternalStore(noChange, readPhone, unknown);
  // Null until this browser has said which subscription it holds.
  const [on, setOn] = useState<boolean | null>(null);
  const [stopped, setStopped] = useState(savedStopped);
  const [deniedNow, setDeniedNow] = useState(false);
  const [reminder, setReminder] = useState(savedReminder);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // As one string, so the effect runs again only when the saved devices change, not on every new array.
  const saved = endpoints.join("\n");
  useEffect(() => {
    let live = true;
    void thisDeviceEndpoint().then((endpoint) => {
      if (live) setOn(endpoint !== null && saved.split("\n").includes(endpoint));
    });
    return () => {
      live = false;
    };
  }, [saved]);

  const view = notificationsCard({
    phone,
    block: deniedNow ? "denied" : block === "none" || block === "unknown" ? null : block,
    hasKey: publicKey !== null,
    on: on === true,
    stopped,
  });
  const reading = on === null || block === "unknown";

  async function flipMaster(next: boolean) {
    if (busy || reading) return;
    setBusy(true);
    setError(null);
    try {
      if (!next) {
        const endpoint = await thisDeviceEndpoint();
        if (endpoint) await turnOffNotificationsAction(endpoint);
        await unsubscribeDevice();
        setOn(false);
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

  async function flipReminder(next: boolean) {
    if (!view.rowsLive) return;
    setError(null);
    setReminder(next);
    const result = await saveNotificationAction("reminder", next);
    if (result.error) {
      setReminder(!next);
      setError(result.error);
    }
  }

  return (
    <div className="mx-4 flex flex-col gap-2">
      <div className="flex flex-col overflow-hidden rounded-[14px] border border-border bg-card">
        <div className="flex min-h-18 items-center gap-3 border-b border-border py-3 pr-1 pl-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 id="notifications-label" className="text-[20px] leading-6 font-black text-foreground">
              Notifications
            </h2>
            <p className="text-sm leading-5 text-muted-foreground">{view.line}</p>
          </div>
          <Switch
            checked={on === true}
            onCheckedChange={flipMaster}
            disabled={view.masterDisabled}
            aria-busy={busy || reading}
            aria-labelledby="notifications-label"
          />
        </div>
        <div className={`flex flex-col ${view.rowsLive ? "" : "opacity-50"}`}>
          <div className="flex min-h-14 items-center gap-3 py-1.5 pr-1 pl-3">
            <Bell size={20} className="shrink-0 text-primary" aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col">
              <p id="reminder-label" className="text-base leading-6 font-semibold">
                Remind me before picks lock
              </p>
              <p className="text-sm leading-5 text-muted-foreground">The day before, if you&rsquo;re not done.</p>
            </div>
            <Switch
              checked={view.rowsLive && reminder}
              onCheckedChange={flipReminder}
              disabled={!view.rowsLive}
              aria-labelledby="reminder-label"
            />
          </div>
        </div>
      </div>
      {view.note ? <p className="px-3 text-sm leading-5 text-muted-foreground">{NOTE[view.note]}</p> : null}
      {view.note === "home_screen" ? (
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
