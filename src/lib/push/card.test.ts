import { describe, expect, test } from "vitest";
import { notificationsCard, type CardFacts } from "./card";

const iphoneApp: CardFacts = { phone: "ios", block: null, hasKey: true, on: false, stopped: false };

describe("the Notifications card", () => {
  test("off on a phone that can take push: the switch works, the rows are off and locked, and no note", () => {
    expect(notificationsCard(iphoneApp)).toEqual({ line: "Off for this iPhone", masterDisabled: false, rowsLive: false, note: null });
    expect(notificationsCard({ ...iphoneApp, phone: "android" }).line).toBe("Off for this phone");
  });

  test("on: the rows show the member's choices", () => {
    expect(notificationsCard({ ...iphoneApp, on: true })).toEqual({ line: "On for this iPhone", masterDisabled: false, rowsLive: true, note: null });
  });

  test("whatever stops push here disables the switch and says why under the card", () => {
    expect(notificationsCard({ ...iphoneApp, block: "home_screen" })).toMatchObject({ masterDisabled: true, note: "home_screen" });
    expect(notificationsCard({ ...iphoneApp, block: "denied" })).toMatchObject({ masterDisabled: true, note: "denied" });
    expect(notificationsCard({ ...iphoneApp, phone: "other", block: "computer" })).toEqual({
      line: "Off on this computer",
      masterDisabled: true,
      rowsLive: false,
      note: "computer",
    });
  });

  test("with no VAPID key nothing can turn on, anywhere, and the card says so first", () => {
    expect(notificationsCard({ ...iphoneApp, hasKey: false })).toMatchObject({ masterDisabled: true, note: "no_key" });
    expect(notificationsCard({ ...iphoneApp, hasKey: false, block: "computer", phone: "other" }).note).toBe("no_key");
  });

  test("push that stopped reaching the phone is said, and the switch stays free to turn it back on", () => {
    expect(notificationsCard({ ...iphoneApp, stopped: true })).toMatchObject({ masterDisabled: false, note: "stopped" });
    expect(notificationsCard({ ...iphoneApp, stopped: true, block: "denied" }).note).toBe("denied");
  });

  test("on, the switch can always be turned off and no note shows, even where push is now blocked", () => {
    expect(notificationsCard({ ...iphoneApp, on: true, block: "denied", stopped: true })).toMatchObject({
      masterDisabled: false,
      note: null,
      rowsLive: true,
    });
  });
});
