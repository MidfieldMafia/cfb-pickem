/**
 * A member's STOP and START, as Pingram reports them by webhook: a signed
 * event sets or clears the flag, and anything Pingram did not sign, or that
 * names nobody, changes nothing.
 */
import { createHmac } from "node:crypto";
import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { members } from "@/db/schema";
import type { Db } from "@/db/types";
import { setPhone, setSmsOptedOut } from "@/lib/members/members";
import { seedWeek2 } from "@/test/week-2";
import { applyPingramEvent, type PingramDelivery } from "./opt-outs";

const SECRET = "whsec_test";

/** A delivery as Pingram signs it: HMAC-SHA256 of `id.timestamp.payload`, timestamp in milliseconds. */
function signed(event: Record<string, unknown>, secret = SECRET, at = Date.now()): PingramDelivery {
  const payload = JSON.stringify({ channel: "SMS", notificationId: "saturday_slate", trackingId: "t-1", ...event });
  const id = "msg_1";
  const timestamp = String(at);
  const signature = createHmac("sha256", secret).update(`${id}.${timestamp}.${payload}`).digest("hex");
  return { payload, id, timestamp, signature: `v1,${signature}` };
}

async function optedOut(db: Db, memberId: number): Promise<boolean> {
  const [row] = await db.select({ flag: members.smsOptedOut }).from(members).where(eq(members.id, memberId));
  return row.flag;
}

describe("STOP and START from Pingram", () => {
  test("a signed SMS_UNSUBSCRIBE opts the member out, and SMS_SUBSCRIBE opts them back in", async () => {
    const { db, grandma } = await seedWeek2();

    expect(await applyPingramEvent(db, signed({ eventType: "SMS_UNSUBSCRIBE", userId: String(grandma.id) }), SECRET)).toBe(
      "opted_out",
    );
    expect(await optedOut(db, grandma.id)).toBe(true);

    // Pingram retries a delivery with the same payload; setting the flag twice is harmless.
    expect(await applyPingramEvent(db, signed({ eventType: "SMS_UNSUBSCRIBE", userId: String(grandma.id) }), SECRET)).toBe(
      "opted_out",
    );

    expect(await applyPingramEvent(db, signed({ eventType: "SMS_SUBSCRIBE", userId: String(grandma.id) }), SECRET)).toBe(
      "opted_in",
    );
    expect(await optedOut(db, grandma.id)).toBe(false);
  });

  test("a recipient Pingram knows by phone number, from before sends carried the member id, is found by that number", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    await setPhone(db, jonah, grandma.id, "(256) 555-0002");

    expect(await applyPingramEvent(db, signed({ eventType: "SMS_UNSUBSCRIBE", userId: "+12565550002" }), SECRET)).toBe(
      "opted_out",
    );
    expect(await optedOut(db, grandma.id)).toBe(true);
  });

  test("an unsigned, wrongly signed or stale delivery changes nothing", async () => {
    const { db, grandma } = await seedWeek2();
    const stop = { eventType: "SMS_UNSUBSCRIBE", userId: String(grandma.id) };

    const unsigned = { ...signed(stop), signature: "" };
    expect(await applyPingramEvent(db, unsigned, SECRET)).toBe("unsigned");
    expect(await applyPingramEvent(db, signed(stop, "someone-else"), SECRET)).toBe("unsigned");
    expect(await applyPingramEvent(db, signed(stop, SECRET, Date.now() - 10 * 60_000), SECRET)).toBe("unsigned");
    // A tampered body no longer matches its signature.
    const good = signed(stop);
    expect(await applyPingramEvent(db, { ...good, payload: good.payload.replace("SMS_UNSUBSCRIBE", "SMS_SUBSCRIBE") }, SECRET)).toBe(
      "unsigned",
    );
    // With no secret configured, nothing is trusted.
    expect(await applyPingramEvent(db, signed(stop, ""), undefined)).toBe("unsigned");

    expect(await optedOut(db, grandma.id)).toBe(false);
  });

  test("an event for nobody the app knows, or of another kind, changes nothing", async () => {
    const { db, jonah, grandma } = await seedWeek2();
    await setSmsOptedOut(db, jonah, grandma.id, true);

    expect(await applyPingramEvent(db, signed({ eventType: "SMS_SUBSCRIBE", userId: "999999" }), SECRET)).toBe("unknown_member");
    expect(await applyPingramEvent(db, signed({ eventType: "SMS_SUBSCRIBE", userId: "+19995550000" }), SECRET)).toBe(
      "unknown_member",
    );
    expect(await applyPingramEvent(db, signed({ eventType: "SMS_SUBSCRIBE", userId: "" }), SECRET)).toBe("unknown_member");
    expect(await applyPingramEvent(db, signed({ eventType: "SMS_DELIVERED", userId: String(grandma.id) }), SECRET)).toBe("ignored");

    expect(await optedOut(db, grandma.id)).toBe(true);
  });
});
