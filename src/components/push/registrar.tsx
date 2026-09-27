"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { clearAppBadge, registerServiceWorker } from "@/lib/push/client";

/**
 * Keeps the service worker registered for members who turned notifications
 * on (a worker that is never re-registered never updates), and clears the
 * app icon's badge whenever the Chat tab is on screen — the same moment the
 * tab's own badge goes to zero. Renders nothing.
 */
export function PushRegistrar() {
  const pathname = usePathname();
  const onChat = pathname === "/chat";

  useEffect(() => {
    void registerServiceWorker();
  }, []);

  useEffect(() => {
    if (!onChat) return;
    const clear = () => {
      if (document.visibilityState === "visible") void clearAppBadge();
    };
    clear();
    document.addEventListener("visibilitychange", clear);
    return () => document.removeEventListener("visibilitychange", clear);
  }, [onChat]);

  return null;
}
