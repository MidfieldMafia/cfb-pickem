/**
 * Who is asked to turn on the Pick reminder, and where (#482): the first-open
 * sheet (A1) and the Picks banner (A2) for members in the Home Screen app, and
 * for a new member the "One last step" page (B) on the app's first open. The
 * Picks page and the browser each know half of the rules; this module holds
 * them both, with no server or browser import.
 */
import { markStepShown, openPicks, stepWasShown } from "@/lib/install/nudge";
import { pushBlock, type DeviceFacts } from "./device";

/** This feature's own storage key: the Home Screen app's storage is separate from Safari's, and the #455 nudge keeps its own. */
export const REMINDER_ASK_KEY = "reminder-ask";

/** B shows on the first open within this long of the welcome page. */
export const ONBOARDING_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Members welcomed before this build shipped count as onboarded and get A1 and
 * A2 whenever they open the app, as the Welcome Tour's backfill did.
 */
export const ONBOARDING_FROM = new Date("2026-10-26T00:00:00Z");

/** Whether B applies to this member: welcomed after the cutoff, and not longer ago than the window. */
export function onboardingApplies(welcomedAt: Date | null, now: Date): boolean {
  if (!welcomedAt || welcomedAt < ONBOARDING_FROM) return false;
  return now.getTime() - welcomedAt.getTime() <= ONBOARDING_WINDOW_MS;
}

export type Ask = "step" | "sheet" | "banner" | null;

export interface AskFacts {
  /** The member's reminder is already on. */
  reminderOn: boolean;
  /** The app has a public key to subscribe with. */
  hasKey: boolean;
  /** B applies to the member (`onboardingApplies`, from the server). */
  onboarding: boolean;
  device: DeviceFacts;
}

/** The device-and-member rules that gate every ask: installed, reminder off, push possible and not blocked. */
export function canAsk({ reminderOn, hasKey, device }: AskFacts): boolean {
  return device.installed && !reminderOn && hasKey && pushBlock(device) === null;
}

type Store = Parameters<typeof openPicks>[0];

/**
 * Picks has opened in a device that `canAsk`: what to show. The visit and the
 * sheet-or-banner rule are the #455 nudge's (`openPicks`); B takes the first
 * open of a new member's device, and a member who got B never gets the sheet.
 */
export function chooseAsk(storage: Store, now: Date, facts: AskFacts, popupShowing: boolean): Ask {
  if (!canAsk(facts)) return null;
  const nudge = openPicks(storage, now, { popupShowing }, REMINDER_ASK_KEY);
  if (facts.onboarding && !stepWasShown(storage, REMINDER_ASK_KEY)) return "step";
  return nudge;
}

/** B was left, any way: it never shows again on this device. */
export const leaveStep = (storage: Store) => markStepShown(storage, REMINDER_ASK_KEY);
