"use client";

import { useEffect } from "react";
import { refreshServiceWorker } from "@/lib/push/device";

/**
 * Checks for a newer service worker on each launch, where one is registered:
 * a worker nothing re-checks keeps the version the member subscribed with.
 * Renders nothing, and registers nothing new; Settings does that from the tap.
 */
export function PushRegistrar() {
  useEffect(() => {
    void refreshServiceWorker();
  }, []);
  return null;
}
