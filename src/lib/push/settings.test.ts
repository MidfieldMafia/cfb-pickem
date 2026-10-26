/**
 * The Settings switch for the Pick reminder by push (#454): what turning it on
 * and off saves, and how a device's subscription follows it.
 */
import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { members, pushSubscriptions } from "@/db/schema";
import type { Db } from "@/db/types";
import { seedWeek2, THURSDAY } from "@/test/week-2";
import { InvalidSubscription, reminderSwitch, rotateSubscription, turnOffPush, turnOnPush } from "./settings";

const phone = (endpoint = "https://web.push.apple.com/em-phone") => ({ endpoint, keys: { p256dh: "key", auth: "secret" } });

async function memberRow(db: Db, id: number) {
  const [row] = await db.select().from(members).where(eq(members.id, id));
  return row;
}

const endpointsOf = async (db: Db, memberId: number) =>
  (await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.memberId, memberId))).map((d) => d.endpoint).sort();

describe("the Pick reminder switch", () => {
  test("everyone starts off", async () => {
    const { db, grandma } = await seedWeek2();
    expect(reminderSwitch(await memberRow(db, grandma.id))).toEqual({ on: false, stopped: false });
  });

  test("turning it on saves Push and this device; turning it off deletes every device the member has", async () => {
    const { db, grandma, jonah } = await seedWeek2();
    await turnOnPush(db, grandma, phone());
    await turnOnPush(db, grandma, phone("https://fcm.googleapis.com/fcm/send/em-tablet"));
    await turnOnPush(db, jonah, phone("https://web.push.apple.com/jonah"));

    expect(reminderSwitch(await memberRow(db, grandma.id))).toEqual({ on: true, stopped: false });
    expect(await endpointsOf(db, grandma.id)).toHaveLength(2);

    await turnOffPush(db, grandma);

    expect((await memberRow(db, grandma.id)).reminderChannel).toBe("off");
    expect(await endpointsOf(db, grandma.id)).toEqual([]);
    expect(await endpointsOf(db, jonah.id)).toEqual(["https://web.push.apple.com/jonah"]);
  });

  test("a device that changes hands moves to the member who turned it on last", async () => {
    const { db, grandma, jonah } = await seedWeek2();
    await turnOnPush(db, grandma, phone());
    await turnOnPush(db, jonah, { ...phone(), keys: { p256dh: "new-key", auth: "new-secret" } });

    expect(await endpointsOf(db, grandma.id)).toEqual([]);
    const [row] = await db.select().from(pushSubscriptions);
    expect(row).toMatchObject({ memberId: jonah.id, p256dh: "new-key", auth: "new-secret" });
  });

  test("the note that push stopped reaching the phone lasts until the member next flips the switch", async () => {
    const { db, grandma } = await seedWeek2();
    await db.update(members).set({ pushStoppedAt: THURSDAY }).where(eq(members.id, grandma.id));
    expect(reminderSwitch(await memberRow(db, grandma.id))).toEqual({ on: false, stopped: true });

    await turnOnPush(db, grandma, phone());
    expect(reminderSwitch(await memberRow(db, grandma.id))).toEqual({ on: true, stopped: false });

    await db.update(members).set({ reminderChannel: "off", pushStoppedAt: THURSDAY }).where(eq(members.id, grandma.id));
    await turnOffPush(db, grandma);
    expect(reminderSwitch(await memberRow(db, grandma.id))).toEqual({ on: false, stopped: false });
  });

  test("refuses a subscription the app cannot send to, and saves nothing", async () => {
    const { db, grandma } = await seedWeek2();
    await expect(turnOnPush(db, grandma, { endpoint: "http://insecure.example", keys: { p256dh: "k", auth: "a" } })).rejects.toThrow(
      InvalidSubscription,
    );
    await expect(turnOnPush(db, grandma, { endpoint: "https://ok.example" })).rejects.toThrow(InvalidSubscription);
    expect((await memberRow(db, grandma.id)).reminderChannel).toBe("off");
  });

  test("a subscription the push service rotated replaces the old one, only while the reminder is on", async () => {
    const { db, grandma } = await seedWeek2();
    expect(await rotateSubscription(db, grandma, phone("https://web.push.apple.com/stray"), null)).toBe(false);
    expect(await endpointsOf(db, grandma.id)).toEqual([]);

    await turnOnPush(db, grandma, phone());
    const on = await memberRow(db, grandma.id);
    expect(await rotateSubscription(db, on, phone("https://web.push.apple.com/rotated"), phone().endpoint)).toBe(true);
    expect(await endpointsOf(db, grandma.id)).toEqual(["https://web.push.apple.com/rotated"]);
  });
});
