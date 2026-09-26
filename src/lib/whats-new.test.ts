import { describe, expect, it } from "vitest";
import { hasSeen, markSeen, WHATS_NEW_KEY } from "./whats-new";

function memory() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

const blocked = () => {
  throw new Error("SecurityError");
};

describe("What's new seen", () => {
  it("is unseen until marked, then seen", () => {
    const store = memory();
    expect(hasSeen(() => store, "2026-09-21")).toBe(false);
    markSeen(() => store, "2026-09-21");
    expect(hasSeen(() => store, "2026-09-21")).toBe(true);
  });

  it("shows a newer entry to a browser that saw the last one", () => {
    const store = memory();
    store.setItem(WHATS_NEW_KEY, "2026-09-14");
    expect(hasSeen(() => store, "2026-09-21")).toBe(false);
  });

  it("counts as seen when storage is unavailable, and marking does not throw", () => {
    expect(hasSeen(blocked, "2026-09-21")).toBe(true);
    expect(() => markSeen(blocked, "2026-09-21")).not.toThrow();
  });
});
