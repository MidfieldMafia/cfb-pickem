/**
 * What the Settings card's Notifications header shows (#529, board A on #494):
 * the line under the heading, whether the switch can be flipped, whether the
 * rows below show the member's choices, and the one note under the card. No
 * server or browser import, so the card's rules are tested without either.
 */
import type { ChatNotification } from "@/db/schema";
import type { Phone } from "@/lib/install/install";
import type { PushBlock } from "./device";

/** Why the switch is off and what to do about it, said once under the card. */
export type CardNote = PushBlock | "stopped" | "no_key";

export const NOTE: Record<CardNote, string> = {
  home_screen: "Works from the Home Screen app.",
  computer: "Turn these on in the app on your phone.",
  denied: "Blocked in iPhone Settings › Notifications.",
  stopped: "Stopped reaching your phone, so this turned off.",
  no_key: "Notifications aren't set up yet.",
};

export interface CardFacts {
  /** The device, from its user agent; "unknown" while the server renders. */
  phone: Phone | "unknown";
  /** What stops push on this device, or null. */
  block: PushBlock | null;
  /** The server has a VAPID public key to subscribe with. */
  hasKey: boolean;
  /** This device's subscription is one of the member's saved devices. */
  on: boolean;
  /** Push stopped reaching the member's last device (`pushStopped`). */
  stopped: boolean;
}

export interface CardView {
  line: string;
  masterDisabled: boolean;
  /** The rows show the member's saved choices and can be changed; otherwise each shows off, greyed and locked. */
  rowsLive: boolean;
  note: CardNote | null;
}

const DEVICE: Record<Phone | "unknown", string> = { ios: "iPhone", android: "phone", other: "computer", unknown: "phone" };

/**
 * On, the switch can always be turned off and nothing else is said. Off, a
 * missing key or a blocked device disables it with its note; push that stopped
 * is said too, but the switch stays free, since turning it on is the fix.
 */
export function notificationsCard(facts: CardFacts): CardView {
  const device = DEVICE[facts.phone];
  if (facts.on) return { line: `On for this ${device}`, masterDisabled: false, rowsLive: true, note: null };
  const line = facts.phone === "other" ? "Off on this computer" : `Off for this ${device}`;
  const blocked: CardNote | null = !facts.hasKey ? "no_key" : facts.block;
  return { line, masterDisabled: blocked !== null, rowsLive: false, note: blocked ?? (facts.stopped ? "stopped" : null) };
}

/** The Chat row's three segments, in order, for the choices `members.notify_chat` saves (#530). */
export const CHAT_CHOICES: { value: ChatNotification; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mentions", label: "@mentions" },
  { value: "off", label: "Off" },
];

const CHAT_LINE: Record<ChatNotification, string> = {
  all: "The first new message since you last read Chat.",
  mentions: "When someone mentions you or @everyone.",
  off: "Nothing from Chat.",
};

/** The segment the Chat row shows and the line under it: Off, like every other row, while the rows are locked. */
export function chatRow(rowsLive: boolean, saved: ChatNotification): { shown: ChatNotification; line: string } {
  const shown = rowsLive ? saved : "off";
  return { shown, line: CHAT_LINE[shown] };
}
