/**
 * A member's STOP and START, heard from Pingram. Pingram stops texting a
 * number that replies STOP, whatever the app sends, and starts again on START;
 * its Events Webhook reports both as `SMS_UNSUBSCRIBE` and `SMS_SUBSCRIBE`.
 * This keeps `members.smsOptedOut` in step, so the console and the reminder
 * plan show what Pingram will do (docs/research/pingram-opt-out.md).
 *
 * Events name a `userId`, never a phone number. Every send carries the member's
 * id as that user (`sender.ts`), so the id finds the member. A text sent before
 * that was filed under its phone number, so a `userId` that reads as one is
 * matched to the member who holds it.
 *
 * Nothing the app does sends a STOP: the flag only follows what the member
 * texted, or what a commissioner recorded by hand.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { verify } from "pingram/webhooks";
import { members } from "@/db/schema";
import type { Db } from "@/db/types";
import { memberByNumber, recordSmsOptOut } from "@/lib/members/members";
import { toE164 } from "./phone";

/** One webhook delivery: the raw body and Pingram's `X-Pingram-Id`, `-Timestamp` and `-Signature` headers. */
export interface PingramDelivery {
  payload: string;
  id: string;
  timestamp: string;
  signature: string;
}

/** What a delivery did; only `unsigned` is refused, so Pingram stops retrying everything else. */
export type PingramEventOutcome = "unsigned" | "ignored" | "unknown_member" | "opted_out" | "opted_in";

/** The events that move the flag, and whether each leaves the member opted out. */
const OPTED_OUT_BY_EVENT = { SMS_UNSUBSCRIBE: true, SMS_SUBSCRIBE: false } as const;

/** The member an event's `userId` names: their id, or failing that the number they hold. */
async function memberFor(db: Db, userId: string): Promise<number | null> {
  if (/^\d+$/.test(userId)) {
    const [row] = await db.select({ id: members.id }).from(members).where(eq(members.id, Number(userId)));
    if (row) return row.id;
  }
  const number = userId.startsWith("+") ? toE164(userId) : null;
  return number ? ((await memberByNumber(db, number))?.id ?? null) : null;
}

/**
 * Verifies a delivery against `secret` (`PINGRAM_WEBHOOK_SECRET`) and applies
 * a STOP or START to the member it names. With no secret set nothing is
 * trusted. Pingram retries a delivery unchanged, and setting a flag twice is
 * harmless.
 */
export async function applyPingramEvent(
  db: Db,
  delivery: PingramDelivery,
  secret: string | undefined,
): Promise<PingramEventOutcome> {
  if (!secret) return "unsigned";
  let event;
  try {
    const { payload, id, timestamp, signature } = delivery;
    event = verify({ payload, headers: { id, timestamp, signature }, secret });
  } catch {
    return "unsigned";
  }
  if (!(event.eventType in OPTED_OUT_BY_EVENT)) return "ignored";
  const optedOut = OPTED_OUT_BY_EVENT[event.eventType as keyof typeof OPTED_OUT_BY_EVENT];
  const memberId = await memberFor(db, String(event.userId ?? ""));
  if (memberId === null) return "unknown_member";
  await recordSmsOptOut(db, memberId, optedOut);
  return optedOut ? "opted_out" : "opted_in";
}
