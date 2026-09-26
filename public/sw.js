/**
 * Saturday Slate's service worker. It does two things: shows a push as a
 * notification (and puts the unread count on the app icon), and opens the
 * app where the notification points when it is tapped.
 *
 * Deliberately no `fetch` handler. A service worker only affects what a
 * page loads when it intercepts requests; this one never does, so every
 * screen and every live-score poll goes to the network exactly as before.
 * Keep it that way: an offline cache here would show stale scores.
 */

self.addEventListener("install", () => {
  // Take over from an older worker at once, so a fixed banner shows on the next push, not the next launch.
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

  const show = self.registration.showNotification(payload.title, {
    body: typeof payload.body === "string" ? payload.body : "",
    tag: typeof payload.tag === "string" ? payload.tag : undefined,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: typeof payload.url === "string" ? payload.url : "/" },
  });

  const badge =
    typeof payload.badge === "number" && "setAppBadge" in self.navigator
      ? payload.badge > 0
        ? self.navigator.setAppBadge(payload.badge)
        : self.navigator.clearAppBadge()
      : Promise.resolve();

  event.waitUntil(Promise.all([show, badge.catch(() => undefined)]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // The installed app is one window: bring it forward and send it to the page, rather than opening a second.
      const open = clients.find((c) => "focus" in c);
      if (open) {
        return open.focus().then((focused) => ("navigate" in focused ? focused.navigate(url) : undefined));
      }
      return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  // The push service rotated the subscription: hand the app the new one so its row follows.
  const old = event.oldSubscription;
  const options = old
    ? {
        userVisibleOnly: true,
        applicationServerKey: old.options.applicationServerKey,
      }
    : null;
  if (!options) return;
  event.waitUntil(
    self.registration.pushManager.subscribe(options).then((sub) =>
      fetch("/api/push", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          replaces: old.endpoint,
        }),
      }).catch(() => undefined),
    ),
  );
});
