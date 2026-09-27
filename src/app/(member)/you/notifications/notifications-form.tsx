"use client";

import { Button, Card, Checkbox, LINK, SECTION_LABEL } from "@saturday-slate/design-system";
import { BellOff, BellRing } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { isInstalled } from "@/lib/install/install";
import { currentSubscription, isIos, pushSupported, subscribeDevice } from "@/lib/push/client";
import type { PushDeviceJson, PushStateJson } from "@/lib/push/http";
import { COMMISSIONER_KINDS, type PushKind } from "@/lib/push/payload";

/** Each switch's label, in the order the screen shows them. Commissioner ones are listed only for a commissioner. */
const SWITCHES: { kind: PushKind; label: string; detail?: string }[] = [
  { kind: "chat", label: "New Chat messages" },
  { kind: "finals", label: "Games going Final", detail: "with how your pick did" },
  { kind: "close", label: "Close games", detail: "under 2:00 left, one score, and the trailing team has the ball" },
  { kind: "feedback", label: "Feedback from a member", detail: "a bug or an idea sent from You" },
  { kind: "review", label: "A result needs review", detail: "a game still not final hours after kickoff" },
  { kind: "rollCall", label: "Deadline roll call", detail: "who hasn't picked, when the reminders go out" },
];

type Phase =
  | { kind: "loading" }
  | { kind: "off" } // server has no keys
  | { kind: "install" } // iOS in Safari: Home Screen first
  | { kind: "unsupported" }
  | { kind: "denied" }
  | { kind: "ready"; endpoint: string | null; state: PushStateJson }
  | { kind: "error"; message: string };

async function readState(): Promise<PushStateJson> {
  const response = await fetch("/api/push", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not read your notification settings.");
  return (await response.json()) as PushStateJson;
}

/**
 * The device's own row is the one whose endpoint matches this browser's
 * subscription; the others are the member's other phones, listed so a lost
 * one can be turned off from here.
 */
export function NotificationsForm({ publicKey }: { publicKey: string | null }) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // What this device can do is only known in the browser, after the server answers, so it is read here.
  useEffect(() => {
    let cancelled = false;
    const settle = (next: Phase) => {
      if (!cancelled) setPhase(next);
    };
    (async () => {
      try {
        const state = await readState();
        if (!state.enabled) return settle({ kind: "off" });
        if (!pushSupported())
          return settle({
            kind: isIos() && !isInstalled() ? "install" : "unsupported",
          });
        if (Notification.permission === "denied") return settle({ kind: "denied" });
        const sub = await currentSubscription();
        const endpoint = sub && state.devices.some((d) => d.endpoint === sub.endpoint) ? sub.endpoint : null;
        settle({ kind: "ready", endpoint, state });
      } catch (error) {
        settle({
          kind: "error",
          message: error instanceof Error ? error.message : "Something went wrong.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const turnOn = async () => {
    if (!publicKey) return;
    setBusy(true);
    try {
      const outcome = await subscribeDevice(publicKey);
      if (!outcome.ok) {
        setPhase(outcome.why === "denied" ? { kind: "denied" } : { kind: "unsupported" });
        return;
      }
      const response = await fetch("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: outcome.subscription.toJSON() }),
      });
      if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error ?? "Could not save.");
      setPhase({
        kind: "ready",
        endpoint: outcome.subscription.endpoint,
        state: (await response.json()) as PushStateJson,
      });
    } catch (error) {
      setPhase({
        kind: "error",
        message: error instanceof Error ? error.message : "Something went wrong.",
      });
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async (endpoint: string, thisDevice: boolean) => {
    setBusy(true);
    try {
      if (thisDevice) await (await currentSubscription())?.unsubscribe();
      const response = await fetch("/api/push", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
      if (!response.ok) throw new Error("Could not turn notifications off.");
      const state = (await response.json()) as PushStateJson;
      setPhase({
        kind: "ready",
        endpoint: thisDevice ? null : phase.kind === "ready" ? phase.endpoint : null,
        state,
      });
    } catch (error) {
      setPhase({
        kind: "error",
        message: error instanceof Error ? error.message : "Something went wrong.",
      });
    } finally {
      setBusy(false);
    }
  };

  const setPreference = async (endpoint: string, key: PushKind, value: boolean) => {
    if (phase.kind !== "ready") return;
    const device = phase.state.devices.find((d) => d.endpoint === endpoint);
    if (!device) return;
    const preferences = { ...preferencesOf(device), [key]: value };
    const response = await fetch("/api/push", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint, preferences }),
    });
    if (response.ok) setPhase({ ...phase, state: (await response.json()) as PushStateJson });
  };

  if (phase.kind === "loading") return <p className="text-sm text-muted-foreground">Checking this device…</p>;

  if (phase.kind === "off") {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">Notifications aren&rsquo;t set up on this server yet.</p>
      </Card>
    );
  }

  if (phase.kind === "install") {
    return (
      <Card className="gap-2">
        <p className="text-sm">On iPhone, notifications work once the app is on your Home Screen.</p>
        <Link href="/install" className={LINK}>
          Add it to your Home Screen
        </Link>
      </Card>
    );
  }

  if (phase.kind === "unsupported") {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">This browser can&rsquo;t receive notifications.</p>
      </Card>
    );
  }

  if (phase.kind === "denied") {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">
          Notifications are blocked for this app. Allow them in your phone&rsquo;s Settings, then come back here.
        </p>
      </Card>
    );
  }

  if (phase.kind === "error") {
    return (
      <Card className="gap-2">
        <p role="alert" className="text-sm">
          {phase.message}
        </p>
        <Button variant="outline" className="tap self-start" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </Button>
      </Card>
    );
  }

  const { endpoint, state } = phase;
  const thisDevice = endpoint ? state.devices.find((d) => d.endpoint === endpoint) : undefined;
  const others = state.devices.filter((d) => d.endpoint !== endpoint);

  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-3">
        <p className={SECTION_LABEL}>This device</p>
        {thisDevice ? (
          <>
            {SWITCHES.filter((s) => state.commissioner || !COMMISSIONER_KINDS.includes(s.kind)).map((s) => (
              <label key={s.kind} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={thisDevice[s.kind]}
                  disabled={busy}
                  onChange={(e) => void setPreference(thisDevice.endpoint, s.kind, e.target.checked)}
                />
                <span>
                  {s.label}
                  {s.detail ? <span className="text-muted-foreground"> · {s.detail}</span> : null}
                </span>
              </label>
            ))}
            <Button
              variant="outline"
              className="tap self-start"
              disabled={busy}
              onClick={() => void turnOff(thisDevice.endpoint, true)}
            >
              <BellOff aria-hidden />
              Turn off on this device
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Notifications are off on this device.</p>
            <Button className="tap self-start" disabled={busy} onClick={() => void turnOn()}>
              <BellRing aria-hidden />
              Turn on
            </Button>
          </>
        )}
      </Card>

      {others.length > 0 ? (
        <Card className="gap-3">
          <p className={SECTION_LABEL}>Your other devices</p>
          {others.map((d) => (
            <div key={d.endpoint} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-muted-foreground">{describeDevice(d.userAgent, d.createdAt)}</span>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void turnOff(d.endpoint, false)}>
                Turn off
              </Button>
            </div>
          ))}
        </Card>
      ) : null}
    </div>
  );
}

function preferencesOf(device: PushDeviceJson): Record<PushKind, boolean> {
  return {
    chat: device.chat,
    finals: device.finals,
    close: device.close,
    feedback: device.feedback,
    review: device.review,
    rollCall: device.rollCall,
  };
}

function describeDevice(userAgent: string | null, createdAt: string): string {
  const ua = userAgent ?? "";
  const kind = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : "Device";
  const added = new Date(createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `${kind} · added ${added}`;
}
