/**
 * The Settings card's Notifications (#454, #529): the master switch saves and
 * deletes this device only, the rows save one kind each and never touch a
 * device, and a rotated subscription follows the device it replaces.
 */
import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { members, pushSubscriptions } from "@/db/schema";
import type { Db } from "@/db/types";
import { seedWeek2, THURSDAY } from "@/test/week-2";
import {
  InvalidSetting,
  InvalidSubscription,
  notificationSettings,
  pushStopped,
  rotateSubscription,
  saveNotificationSetting,
  savedEndpoints,
  turnOffPush,
  turnOnPush,
} from "./settings";

const PHONE = "https://web.push.apple.com/em-phone";
const TABLET = "https://fcm.googleapis.com/fcm/send/em-tablet";
const phone = (endpoint = PHONE) => ({ endpoint, keys: { p256dh: "key", auth: "secret" } });

async function memberRow(db: Db, id: number) {
  const [row] = await db.select().from(members).where(eq(members.id, id));
  return row;
}

const endpointsOf = async (db: Db, memberId: number) => (await savedEndpoints(db, memberId)).sort();

describe("what each member is pushed", () => {
  test("starts with the Pick reminder on, Chat at @mentions and the rest on, for every member", async () => {
    const { db, grandma, jonah } = await seedWeek2();
    const defaults = { reminder: true, chat: "mentions", weeklyWin: true, closeGames: true, feedback: true };
    expect(notificationSettings(await memberRow(db, grandma.id))).toEqual(defaults);
    expect(notificationSettings(await memberRow(db, jonah.id))).toEqual(defaults);
  });

  test("a row saves its one kind and touches no device", async () => {
    const { db, grandma } = await seedWeek2();
    await turnOnPush(db, grandma, phone());

    await saveNotificationSetting(db, await memberRow(db, grandma.id), "reminder", false);
    await saveNotificationSetting(db, await memberRow(db, grandma.id), "chat", "all");

    expect(notificationSettings(await memberRow(db, grandma.id))).toMatchObject({ reminder: false, chat: "all", weeklyWin: true });
    expect(await endpointsOf(db, grandma.id)).toEqual([PHONE]);
  });

  test("refuses a value the kind does not take, and New Feedback for anyone but a commissioner", async () => {
    const { db, grandma, jonah } = await seedWeek2();
    const her = await memberRow(db, grandma.id);
    await expect(saveNotificationSetting(db, her, "chat", "loud")).rejects.toThrow(InvalidSetting);
    await expect(saveNotificationSetting(db, her, "reminder", "yes")).rejects.toThrow(InvalidSetting);
    await expect(saveNotificationSetting(db, her, "nonsense" as never, true)).rejects.toThrow(InvalidSetting);
    await expect(saveNotificationSetting(db, her, "feedback", false)).rejects.toThrow(InvalidSetting);
    expect(notificationSettings(await memberRow(db, grandma.id))).toMatchObject({ chat: "mentions", reminder: true, feedback: true });

    await saveNotificationSetting(db, await memberRow(db, jonah.id), "feedback", false);
    expect(notificationSettings(await memberRow(db, jonah.id)).feedback).toBe(false);
  });
});

describe("the Notifications switch, per device", () => {
  test("on saves this device; off deletes this device only, and leaves the settings as they are", async () => {
    const { db, grandma, jonah } = await seedWeek2();
    await turnOnPush(db, grandma, phone());
    await turnOnPush(db, grandma, phone(TABLET));
    await turnOnPush(db, jonah, phone("https://web.push.apple.com/jonah"));
    await saveNotificationSetting(db, await memberRow(db, grandma.id), "weeklyWin", false);
    expect(await endpointsOf(db, grandma.id)).toEqual([TABLET, PHONE].sort());

    await turnOffPush(db, grandma, PHONE);

    expect(await endpointsOf(db, grandma.id)).toEqual([TABLET]);
    expect(await endpointsOf(db, jonah.id)).toEqual(["https://web.push.apple.com/jonah"]);
    expect(notificationSettings(await memberRow(db, grandma.id))).toMatchObject({ reminder: true, weeklyWin: false });
  });

  test("off never deletes another member's device, whatever endpoint it is handed", async () => {
    const { db, grandma, jonah } = await seedWeek2();
    await turnOnPush(db, jonah, phone("https://web.push.apple.com/jonah"));
    await turnOffPush(db, grandma, "https://web.push.apple.com/jonah");
    await turnOffPush(db, grandma, 42);
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

  test("the note that push stopped shows while the member has no device left, and turning it on clears it", async () => {
    const { db, grandma } = await seedWeek2();
    expect(pushStopped(await memberRow(db, grandma.id), 0)).toBe(false);
    await db.update(members).set({ pushStoppedAt: THURSDAY }).where(eq(members.id, grandma.id));
    expect(pushStopped(await memberRow(db, grandma.id), 0)).toBe(true);
    expect(pushStopped(await memberRow(db, grandma.id), 1)).toBe(false);

    await turnOnPush(db, grandma, phone());
    expect((await memberRow(db, grandma.id)).pushStoppedAt).toBeNull();
  });

  test("refuses a subscription the app cannot send to, and saves nothing", async () => {
    const { db, grandma } = await seedWeek2();
    await db.update(members).set({ pushStoppedAt: THURSDAY }).where(eq(members.id, grandma.id));
    await expect(turnOnPush(db, grandma, { endpoint: "http://insecure.example", keys: { p256dh: "k", auth: "a" } })).rejects.toThrow(
      InvalidSubscription,
    );
    await expect(turnOnPush(db, grandma, { endpoint: "https://ok.example" })).rejects.toThrow(InvalidSubscription);
    expect(await endpointsOf(db, grandma.id)).toEqual([]);
    expect((await memberRow(db, grandma.id)).pushStoppedAt).toEqual(THURSDAY);
  });
});

describe("a subscription the push service rotated", () => {
  test("replaces the member's own device, whatever their settings", async () => {
    const { db, grandma } = await seedWeek2();
    await turnOnPush(db, grandma, phone());
    await saveNotificationSetting(db, await memberRow(db, grandma.id), "reminder", false);

    expect(await rotateSubscription(db, grandma, phone("https://web.push.apple.com/rotated"), PHONE)).toBe(true);
    expect(await endpointsOf(db, grandma.id)).toEqual(["https://web.push.apple.com/rotated"]);
  });

  test("is not saved when the old one was not this member's device: none, deleted, or someone else's", async () => {
    const { db, grandma, jonah } = await seedWeek2();
    await turnOnPush(db, jonah, phone("https://web.push.apple.com/jonah"));

    expect(await rotateSubscription(db, grandma, phone("https://web.push.apple.com/stray"), null)).toBe(false);
    expect(await rotateSubscription(db, grandma, phone("https://web.push.apple.com/stray"), PHONE)).toBe(false);
    expect(await rotateSubscription(db, grandma, phone("https://web.push.apple.com/stray"), "https://web.push.apple.com/jonah")).toBe(false);

    expect(await endpointsOf(db, grandma.id)).toEqual([]);
    expect(await endpointsOf(db, jonah.id)).toEqual(["https://web.push.apple.com/jonah"]);
  });
});
