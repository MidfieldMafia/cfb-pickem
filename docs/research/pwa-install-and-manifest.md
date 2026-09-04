# Add-to-Home-Screen, Web Manifest & Icons: Research Findings (2026)

Research for Saturday Slate's welcome page: after a member taps their SMS magic link and
signs in, we want the page to guide them to add the app to their home screen. This file
summarizes primary-source research on iOS Safari / Android Chrome A2HS behavior and how
Next.js 16 App Router declares manifest/icons.

## Summary — Recommendations for this app

1. **Login state survives install on iOS only if the user installs from the same Safari
   session that signed in.** A Home Screen web app on iOS gets its own storage partition
   (cookies, localStorage, IndexedDB, Service Worker) **separate** from ordinary Safari
   tabs going forward — but a page's storage at the *moment of installation* becomes
   that new partition's starting state (topic 1). So: **tell users to tap the magic
   link, let it open in Safari, sign in, then immediately use Share → Add to Home
   Screen in that same Safari session.** Don't sign in in one context and expect it to
   carry into an app installed later from a different session/browser. No "sync auth
   after install" feature is needed if the flow keeps sign-in and install in the same
   Safari session.
2. **Detect the Messages in-app-browser case and route around it.** If the welcome page
   is opened inside an in-app browser (Messages, Instagram, etc., which use
   `SFSafariViewController` or a WKWebView) rather than full Safari, the standard Share
   sheet may not expose "Add to Home Screen" (varies by host app and iOS version — see
   topic 1). Detect this via user-agent/heuristics if possible, and show an explicit
   "Tap ••• → Open in Safari" instruction before the A2HS instructions, to be safe on
   older iOS/host apps that don't support A2HS from their in-app browser.
3. **Skip the service worker for now.** Neither iOS Safari nor current Chrome requires
   a service worker for "Add to Home Screen" installability (topic 5). Since this app
   shows live/frequently-changing scores, a service worker with an over-eager cache
   (or a naive cache-first strategy) risks serving stale scores; skipping it entirely
   avoids that risk with zero downside for A2HS. Revisit only if/when adding offline
   support or Web Push (see #6).
4. **Manifest**: add `src/app/manifest.ts` returning `MetadataRoute.Manifest` with at
   minimum `name`, `short_name`, `start_url: '/'`, `display: 'standalone'`,
   `background_color`, `theme_color`, and `icons` at 192×192 and 512×512 (topics 2, 4).
5. **Icons**: add `src/app/icon.tsx` (or `icon.png`) for the Android/manifest icon, and
   **also** `src/app/apple-icon.tsx` (or `apple-icon.png`, 180×180) — Next.js emits this
   as a real `<link rel="apple-touch-icon">` tag automatically, which iOS needs
   independently of manifest icons (topic 4).
6. **Theme color**: set via `src/app/layout.tsx`'s exported `viewport` object
   (`themeColor: '...'`), not the deprecated `metadata.themeColor` (topic 4).
7. **Standalone detection on the welcome page**: use
   `window.matchMedia('(display-mode: standalone)').matches` for Android/Chrome and
   `window.navigator.standalone === true` for iOS Safari to detect "already installed"
   and skip the install instructions (topic 3).
8. **Web Push**: iOS requires the app to already be on the Home Screen before it can
   receive Web Push at all (introduced iOS 16.4) — this is a good reason to nudge
   installation now, but push itself is a later feature, not part of this build
   (topic 6).

---

## 1. iOS Safari A2HS mechanics

- **No programmatic trigger exists.** Apple's own "Configuring Web Applications" guide
  (the canonical reference for iOS home-screen web apps) documents only meta tags
  (`apple-mobile-web-app-capable`, icon `<link>` conventions, status bar style) and a
  read-only `window.navigator.standalone` property — it defines no API for a page to
  invoke the "Add to Home Screen" flow itself. [Apple — Configuring Web Applications](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)
- Corroborating this, the only web-facing "install" event, `beforeinstallprompt`, is a
  Chromium-only mechanism; MDN flags it explicitly as **not Baseline** ("does not work
  in some of the most widely-used browsers"), and it has never been implemented by
  WebKit/Safari. [MDN — Window: beforeinstallprompt event](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event)
- **User gesture sequence (current iOS Safari)**: tap the Share icon in Safari's toolbar
  → scroll the share sheet actions and tap "Add to Home Screen" → optionally edit the
  name → tap "Add." Apple's guide covers the resulting meta tags
  (`apple-mobile-web-app-capable=yes` removes the Safari chrome once launched from the
  Home Screen icon) but does not itself narrate the tap sequence UI, confirming there is
  no alternate/shortcut path — it is manual, multi-tap, and initiated only from the
  system Share sheet. [Apple — Configuring Web Applications](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)
- **In-app browsers (Messages, Instagram, etc.) historically lack "Add to Home Screen"
  in their Share sheet**, because they render pages in an embedded browser
  (`SFSafariViewController` or WKWebView) rather than full Safari, and that embedded
  Share sheet did not originally include the option — forcing an "Open in Safari" step
  first. This changed starting **iOS/iPadOS 17**: WebKit's own WWDC23 recap states
  "Add to Home Screen is now available in Safari View Controller," so apps using
  `SFSafariViewController` (which the Messages in-app browser is built on) can support
  it from iOS 17 on — but adoption is host-app- and iOS-version-dependent, so an
  "Open in Safari" fallback instruction is still the safe default. [WebKit — News from WWDC23: WebKit Features in Safari 17 beta](https://webkit.org/blog/14205/news-from-wwdc23-webkit-features-in-safari-17-beta/)
  (No single Apple/WebKit page enumerates which third-party apps have adopted the
  updated Share sheet; that part is corroborated by widespread developer reports, e.g.
  Progressier's in-app-browser detection guidance, used here only to confirm the
  practical pattern, not as a primary source.)
- **Storage: the installed Home Screen app does NOT share Safari's storage going
  forward — it is a separate partition.** This is the critical finding for this app's
  login flow. Session/cookies, localStorage, and even the Service Worker registration
  are **not** shared between Safari and standalone (Home Screen) mode; only the HTTP
  cache is shared between the two contexts. Apple's own developer forums (where WebKit
  engineers participate) describe Home Screen web apps as "not part of Safari," with
  their own storage lifetime/eviction counter, separate from Safari's.
  [Apple Developer Forums — Web storage partitioning](https://developer.apple.com/forums/thread/725074)
  — cross-checked against community engineering write-ups reporting the same behavior
  (session/cookie/localStorage isolation, shared HTTP cache) as the practical
  consequence of WebKit's per-"web app" storage partitioning. **Implication**: if the
  member taps the magic link in Safari, signs in, and installs to the Home Screen from
  that same tab/session, the cookie already resident in that origin's storage is
  inherited by the newly created Home Screen partition at install time. If instead they
  only ever open the link in an in-app browser, or install a stale bookmark from an
  earlier session, the Home Screen app may launch logged out and need the magic link
  again. Keep sign-in and "Add to Home Screen" in the same Safari session.

## 2. Android Chrome install

- **`beforeinstallprompt`**: fires when Chrome detects the page is installable. A site
  can call `event.preventDefault()` to suppress Chrome's automatic mini-infobar, stash
  the event, and later call `event.prompt()` from a custom "Install" button's click
  handler to show the native install dialog on demand. [MDN — Window: beforeinstallprompt event](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event)
- **Installability criteria (manifest)**: Chrome/web.dev's installability reference
  requires a valid manifest with `short_name` or `name`, `icons` (must include 192px
  and 512px entries), `start_url`, and `display` set to one of `fullscreen`,
  `standalone`, `minimal-ui`, or `window-controls-overlay`; `prefer_related_applications`
  must be absent or `false`; and the site must be served over HTTPS.
  [web.dev — What does it take to be installable?](https://web.dev/articles/install-criteria)
- **Service worker requirement has relaxed over time**: Chrome removed the requirement
  for a service worker with a `fetch()` handler for menu-driven installation, starting
  in **Chrome 108 on mobile and Chrome 112 on desktop** — Chrome now offers its own
  default offline fallback page instead of forcing every site to ship a stub service
  worker just to qualify. As of that change, a fetch-handling service worker is **not**
  required simply to be installable from the browser menu, though Chrome's
  algorithm for firing the automatic install *promotion* (the mini-infobar/banner) can
  still weigh it, and a real service worker remains necessary for actual offline
  functionality. [Chrome for Developers — Revisiting Chrome's installability criteria](https://developer.chrome.com/blog/update-install-criteria)
- Two **user-engagement gates** also apply before Chrome fires `beforeinstallprompt`
  automatically: at least one click/tap on the page, and at least 30 seconds on it.
  [web.dev — What does it take to be installable?](https://web.dev/articles/install-criteria)

## 3. Detecting standalone/installed mode

- **Android/Chromium and modern cross-browser approach**: test the CSS `display-mode`
  media feature via `window.matchMedia('(display-mode: standalone)').matches`
  (also `fullscreen`, `minimal-ui`, `window-controls-overlay`, or `browser` when not
  installed). This works because Chromium browsers reflect the manifest's active
  `display` mode into this media feature. [web.dev — Detection](https://web.dev/learn/pwa/detection)
- **iOS Safari**: use the non-standard, Apple-defined
  `window.navigator.standalone` boolean, which is `true` only when the page is running
  as a Home Screen web app launched via `apple-mobile-web-app-capable`. This is
  documented directly in Apple's own Safari web content configuration guide: "You can
  determine whether a webpage is displaying in standalone mode using the
  `window.navigator.standalone` read-only Boolean JavaScript property."
  [Apple — Configuring Web Applications](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)
- Because `display-mode: standalone` and `navigator.standalone` cover different
  browsers, the practical pattern (web.dev) is to check both:
  `matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true`.
  web.dev's own PWA detection guide separately documents
  `navigator.getInstalledRelatedApps()` and the `appinstalled` event as additional
  Chromium-only installed-state signals, useful for analytics but not for iOS.
  [web.dev — Detection](https://web.dev/learn/pwa/detection)

## 4. Manifest and icon requirements

- **Manifest fields** (per Chrome/web.dev installability + MDN's Web App Manifest
  guide): `name`/`short_name`, `icons` (192px and 512px minimum, PNG recommended),
  `start_url`, `display`, plus `background_color` and `theme_color` for the splash
  screen and browser chrome tinting. MDN documents that the auto-generated splash
  screen on Android is built specifically from the manifest's `name`,
  `background_color`, and `icons` fields. [MDN — Web app manifest](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest)
  [web.dev — What does it take to be installable?](https://web.dev/articles/install-criteria)
- **iOS does not fully rely on manifest icons.** Historically iOS Safari ignored
  manifest `icons` entirely and required a dedicated `<link rel="apple-touch-icon">`;
  even now that iOS reads the manifest's `icons` array to some degree, an explicit
  `apple-touch-icon` link, when present, takes priority for the Home Screen icon. The
  most commonly required apple-touch-icon size is **180×180** for modern iPhones.
  Apple's own guide is the authority on the `apple-touch-icon` convention itself:
  "To specify an icon for the entire website... place an icon file in PNG format...
  called `apple-touch-icon.png`," with `<link rel="apple-touch-icon">` variants for
  multiple resolutions and an explicit fallback/selection algorithm ("If there is no
  icon that matches the recommended size for the device, the smallest icon larger than
  the recommended size is used"). [Apple — Configuring Web Applications](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)
  (Precedence of a real `apple-touch-icon` link over manifest icons when both exist is
  corroborated by developer community references, since Apple's own page predates
  manifest-based icon support and documents only the `apple-touch-icon` mechanism.)
- **theme-color meta tag**: `<meta name="theme-color" content="...">` tints browser UI
  (address bar/status bar) to match branding. [MDN — theme-color](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta/name/theme-color)
- **Next.js 16 App Router implementation** (from the locally shipped docs):
  - `src/app/manifest.ts` exporting a default function typed
    `MetadataRoute.Manifest`, returning `name`, `short_name`, `description`,
    `start_url`, `display`, `background_color`, `theme_color`, and an `icons` array —
    Next.js serves this at `/manifest.webmanifest` and auto-injects the
    `<link rel="manifest">` tag.
    (`/Users/jonahmabry/workspace/cfb-pickem/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md`)
  - `src/app/icon.tsx` / `src/app/apple-icon.tsx` (or static `icon.png` /
    `apple-icon.png` files) are dedicated file conventions: `icon` emits
    `<link rel="icon">`, and **`apple-icon` emits `<link rel="apple-touch-icon">`
    directly** — this is exactly the real apple-touch-icon link tag iOS needs, handled
    automatically without manually declaring `icons.apple` in the `Metadata` object.
    (`/Users/jonahmabry/workspace/cfb-pickem/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/app-icons.md`)
  - Alternatively, the static `Metadata.icons` field
    (`icons: { icon, apple, shortcut, other }`) can declare the same links without the
    file-route convention, e.g. `apple: '/apple-icon.png'` → `<link rel="apple-touch-icon">`.
    (`/Users/jonahmabry/workspace/cfb-pickem/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`)
  - `Metadata.themeColor` and `Metadata.viewport` are **deprecated since Next.js 14**.
    Theme color and viewport now belong in the exported `viewport` object or
    `generateViewport()` function, typed `Viewport`, e.g.
    `export const viewport: Viewport = { themeColor: 'black' }` →
    `<meta name="theme-color" content="black">`. This also supports light/dark
    variants via an array of `{ media, color }` pairs.
    (`/Users/jonahmabry/workspace/cfb-pickem/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md`)
  - `Metadata.manifest` can also point at an external/static manifest URL if not using
    the `manifest.ts` file convention: `manifest: '/manifest.json'` →
    `<link rel="manifest" href="/manifest.json">`.
    (`/Users/jonahmabry/workspace/cfb-pickem/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`)
  - This repo has `src/app/favicon.ico`, `layout.tsx`, and `page.tsx`; none of
    `manifest.ts`, `icon.tsx`, or `apple-icon.tsx` exist yet, and `layout.tsx` does not
    yet export `viewport`/`themeColor`.

## 5. Service worker necessity

- **iOS Safari**: no service worker is required to add a page to the Home Screen —
  Apple's Home Screen web app model (the `apple-mobile-web-app-capable` meta tag plus
  the Share sheet flow) predates and is entirely independent of service workers; Apple's
  configuration guide describes A2HS purely in terms of meta tags and icons, with no
  service worker precondition. [Apple — Configuring Web Applications](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)
- **Android Chrome**: as of the current criteria (and since Chrome 108 mobile / 112
  desktop), a fetch-handling service worker is **no longer required** for basic
  installability from the browser menu — only the manifest + HTTPS criteria above are
  mandatory. A service worker is still required if the app wants genuine offline
  support (Chrome's own default offline page only kicks in generically, not with
  app-specific content). [Chrome for Developers — Revisiting Chrome's installability criteria](https://developer.chrome.com/blog/update-install-criteria)
  [web.dev — What does it take to be installable?](https://web.dev/articles/install-criteria)
- **Tradeoff for this app**: Saturday Slate shows live/frequently-updating scores.
  - *No service worker (recommended now)*: simplest option, zero cache-staleness risk
    by construction — there is no cache to go stale, so every score view hits the
    network. No offline support, but for a live sports pick'em app, "no data" while
    offline is arguably safer/clearer to the user than "possibly stale data."
    A2HS installability is unaffected on either platform per the criteria above.
  - *Adding a service worker later*: only worthwhile for offline shell support or Web
    Push (see topic 6). If added, any caching of score/API data **must** use a
    **network-first** (or stale-while-revalidate with very short/no TTL) strategy —
    a naive cache-first strategy risks serving outdated live scores from cache
    indefinitely. Network-first tries the network first and only falls back to the
    cache on failure, which is the standard mitigation for frequently-changing data
    described in Google's offline caching guidance. [web.dev — Common techniques to build offline applications (Offline Cookbook)](https://web.dev/offline-cookbook/)

## 6. Web push on iOS

- **Confirmed: Web Push on iOS/iPadOS requires the site to be a Home Screen web app.**
  WebKit's own announcement: "The Push API on iOS is exclusively available for Home
  Screen web apps... An open tab in Safari, or another browser, does not have access to
  `PushManager`." [WebKit — Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- **Introduced in iOS/iPadOS 16.4**: "Today marks the release of iOS and iPadOS 16.4
  beta 1, and with it comes support for Web Push and other features for Home Screen web
  apps." [WebKit — Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- Once installed, Web Push notifications from a Home Screen web app "work exactly like
  notifications from other apps" — Lock Screen, Notification Center, paired Apple
  Watch, and Focus filtering all apply the same as for native apps.
  [WebKit — Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- **For this app**: this is a strong argument for *encouraging* installation on the
  welcome page now (so users are Home-Screen-ready), but implementing Web Push itself
  (VAPID keys, a service worker with a `push` handler, permission UX) should be treated
  as a distinct, later feature — not part of the current welcome-page/install work.
