import { beforeEach, describe, expect, test, vi } from "vitest";

const subscribeDevice = vi.fn();
const turnOnReminderAction = vi.fn();
vi.mock("@/lib/push/device", () => ({ subscribeDevice }));
vi.mock("@/app/(member)/settings/actions", () => ({ turnOnReminderAction }));

const { turnOnReminder } = await import("./turn-on-reminder");

beforeEach(() => vi.resetAllMocks());

describe("turnOnReminder", () => {
  test("Allow saves the device and Push", async () => {
    subscribeDevice.mockResolvedValue({ ok: true, subscription: { endpoint: "https://x" } });
    turnOnReminderAction.mockResolvedValue({});
    expect(await turnOnReminder("key")).toEqual({ ok: true });
    expect(subscribeDevice).toHaveBeenCalledWith("key");
    expect(turnOnReminderAction).toHaveBeenCalledWith({ endpoint: "https://x" });
  });

  test("Don't Allow saves nothing", async () => {
    subscribeDevice.mockResolvedValue({ ok: false, why: "denied" });
    expect(await turnOnReminder("key")).toEqual({ ok: false, why: "denied" });
    expect(turnOnReminderAction).not.toHaveBeenCalled();
  });

  test("another subscribe failure, and a refused save, say to try again", async () => {
    subscribeDevice.mockResolvedValue({ ok: false, why: "failed" });
    expect(await turnOnReminder("key")).toEqual({ ok: false, why: "error", message: "Couldn't turn it on. Try again." });
    subscribeDevice.mockResolvedValue({ ok: true, subscription: {} });
    turnOnReminderAction.mockResolvedValue({ error: "Nope." });
    expect(await turnOnReminder("key")).toEqual({ ok: false, why: "error", message: "Nope." });
  });
});
