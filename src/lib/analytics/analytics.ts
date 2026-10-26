import posthog from "posthog-js";

/**
 * Product analytics, browser side. `instrumentation-client.ts` starts PostHog
 * only where `NEXT_PUBLIC_POSTHOG_KEY` is set — Production — so on a dev
 * server or a preview every call here does nothing.
 *
 * Page views are captured automatically. The events below are the features
 * worth counting on their own; name a new one here before calling it, so the
 * list stays the one place that says what is tracked.
 */
export type AnalyticsEvent =
  /** A Pick saved from the pick flow. */
  | "pick_saved"
  /** A Lock of the Week placed or moved; `cleared` when it was taken off. */
  | "lock_set"
  /** A Tiebreaker Guess saved. */
  | "tiebreaker_saved"
  /** Feedback sent to the commissioners. */
  | "feedback_sent"
  /** The Home Screen nudge (#455) rendered; `form` is `sheet` or `banner`. */
  | "install_nudge_shown"
  /** The Home Screen nudge closed without acting: Not now, a swipe down or the banner's X; `form` as above. */
  | "install_nudge_dismissed"
  /** The Home Screen nudge's Add to Home Screen, or the banner's Add; `form` as above. */
  | "install_nudge_tapped"
  /** The Pick reminder ask (#482) rendered; `form` is `step`, `sheet` or `banner`. */
  | "reminder_ask_shown"
  /** The Pick reminder ask closed before the member answered; `form` as above. */
  | "reminder_ask_dismissed"
  /** The member's answer came back from `turnOnReminder`; `source` is `step`, `sheet`, `banner` or `settings`, `result` is `on`, `denied` or `error`. */
  | "reminder_turn_on";

export function track(event: AnalyticsEvent, properties?: Record<string, string | number | boolean>): void {
  if (!posthog.__loaded) return;
  posthog.capture(event, properties);
}

/**
 * Ties this browser's events to a member by id alone — never a name — so a
 * member counts once whether they open Safari or the Home Screen app, which
 * iOS gives separate storage and would otherwise count as two people.
 */
export function identifyMember(memberId: number): void {
  if (!posthog.__loaded) return;
  const id = String(memberId);
  if (posthog.get_distinct_id() !== id) posthog.identify(id);
}
