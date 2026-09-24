import { describe, expect, test } from "vitest";
import { ACTIVE_POLL_MS, IDLE_AFTER_MS, IDLE_POLL_MS, nextChatPollMs } from "./poll";

describe("the thread's polling cadence", () => {
  test("polls every few seconds while the thread is moving", () => {
    expect(nextChatPollMs(0)).toBe(ACTIVE_POLL_MS);
    expect(nextChatPollMs(IDLE_AFTER_MS - 1)).toBe(ACTIVE_POLL_MS);
    expect(ACTIVE_POLL_MS).toBeLessThanOrEqual(5_000);
  });

  test("slows once it has been quiet a while", () => {
    expect(nextChatPollMs(IDLE_AFTER_MS)).toBe(IDLE_POLL_MS);
    expect(nextChatPollMs(60 * 60_000)).toBe(IDLE_POLL_MS);
    expect(IDLE_POLL_MS).toBeGreaterThan(ACTIVE_POLL_MS);
  });
});
