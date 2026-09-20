"use client";

import { useEffect, useState } from "react";
import { Wordmark } from "@saturday-slate/design-system";
import { LAUNCH_KEY } from "@/lib/launch";

const HOLD_MS = 1200;
const FADE_MS = 200;

/**
 * Holds the Wordmark on paper for at least HOLD_MS after a Home Screen launch,
 * then fades it out. iOS drops its own launch image at first paint, so this
 * is the only way to keep the brand up past that. CSS shows it only in
 * standalone display mode and only until <html data-launched> is set, so a
 * browser tab and every launch after the first document never see it.
 */
export function LaunchScreen() {
  const [phase, setPhase] = useState<"shown" | "leaving" | "gone">("shown");

  useEffect(() => {
    let launched = false;
    try {
      launched = sessionStorage.getItem(LAUNCH_KEY) !== null;
      sessionStorage.setItem(LAUNCH_KEY, "1");
    } catch {}
    // A repeat load is already hidden by CSS (see LAUNCH_GUARD).
    if (launched) return;
    // performance.now() is the time since the navigation began, so the hold
    // counts load time already spent instead of stacking on top of it.
    const wait = Math.max(0, HOLD_MS - performance.now());
    const leave = setTimeout(() => setPhase("leaving"), wait);
    const done = setTimeout(() => setPhase("gone"), wait + FADE_MS);
    return () => {
      clearTimeout(leave);
      clearTimeout(done);
    };
  }, []);

  if (phase === "gone") return null;
  return (
    <div aria-hidden className="launch-screen" data-leaving={phase === "leaving" ? "" : undefined}>
      <Wordmark size="lg" />
    </div>
  );
}
