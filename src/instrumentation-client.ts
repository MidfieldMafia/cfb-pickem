import posthog from "posthog-js";
import { scrubEvent } from "@/lib/analytics/scrub";
import { isInstalled } from "@/lib/install/install";

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

// Set in Production only, so dev servers and previews send nothing.
if (key) {
  posthog.init(key, {
    // Proxied through next.config.ts rewrites, so ad blockers that stop
    // requests to posthog.com do not stop these.
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    defaults: "2026-08-30",
    // Page views on every client-side navigation, not just the first load.
    capture_pageview: "history_change",
    // Autocapture records the text of what was tapped, and on these screens
    // that text is members' names. The events worth having are named in
    // lib/analytics/analytics.ts instead.
    autocapture: false,
    capture_dead_clicks: false,
    // A replay would show every name and every pick on screen.
    disable_session_recording: true,
    disable_surveys: true,
    capture_exceptions: true,
    // Load times (LCP, INP, CLS, FCP).
    capture_performance: { web_vitals: true },
    person_profiles: "identified_only",
    before_send: scrubEvent,
    // The app uses no feature flags, and the flags request sends the URL a
    // person first landed on — a Join Link token included — without passing
    // through `before_send`.
    advanced_disable_flags: true,
  });
  // Home Screen app or browser tab, on every event.
  posthog.register({ installed: isInstalled() });
}
