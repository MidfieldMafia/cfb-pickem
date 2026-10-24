/**
 * Saturday Slate's service worker (#454). It shows a push as a notification,
 * and on a tap opens the app where the push points: the Pick reminder carries
 * the Picks step still owed.
 *
 * Deliberately no `fetch` handler. A service worker only changes what a page
 * loads when it intercepts requests; this one never does, so every screen and
 * every live-score poll goes to the network exactly as before. Keep it that
 * way: an offline cache here would show stale scores.
 */

self.addEventListener("install", () => {
  // Take over from an older worker at once, so a fix shows on the next push rather than the next launch.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = null;
  try {
    payload = event.data ? event.data.json() : null;
  } catch {
    payload = null;
  }
  if (!payload || typeof payload.title !== "string") return;
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: typeof payload.body === "string" ? payload.body : "",
      // A second reminder for the same Week replaces the first banner rather than stacking.
      tag: typeof payload.tag === "string" ? payload.tag : undefined,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: typeof payload.url === "string" && payload.url.startsWith("/") ? payload.url : "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // The installed app is one window: bring it forward and send it to the page, rather than opening a second.
      const open = clients.find((c) => "focus" in c);
      if (open) return open.focus().then((focused) => ("navigate" in focused ? focused.navigate(url) : undefined));
      return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  // The push service rotated the subscription: subscribe again and hand the app the new one, so the reminder follows.
  const old = event.oldSubscription;
  if (!old || !old.options || !old.options.applicationServerKey) return;
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: old.options.applicationServerKey })
      .then((sub) =>
        fetch("/api/push", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subscription: sub.toJSON(), replaces: old.endpoint }),
        }),
      )
      .catch(() => undefined),
  );
});
