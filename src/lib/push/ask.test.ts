import { describe, expect, test } from "vitest";
import { VISIT_GAP_MS } from "@/lib/install/nudge";
import { chooseAsk, leaveStep, onboardingApplies, ONBOARDING_FROM, type AskFacts } from "./ask";

function memory() {
  const items = new Map<string, string>();
  const storage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
  return () => storage;
}

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const facts = (change: Partial<AskFacts> & { installed?: boolean; permission?: NotificationPermission } = {}): AskFacts => ({
  reminderOn: change.reminderOn ?? false,
  hasKey: change.hasKey ?? true,
  onboarding: change.onboarding ?? false,
  device: { userAgent: IPHONE, installed: change.installed ?? true, pushApi: true, permission: change.permission ?? "default" },
});

const t0 = new Date("2026-11-02T15:00:00Z");
const nextVisit = (from: Date) => new Date(from.getTime() + VISIT_GAP_MS + 60_000);

describe("onboardingApplies", () => {
  const welcomed = new Date("2026-11-02T12:00:00Z");
  test("within 24 hours of the welcome page", () => {
    expect(onboardingApplies(welcomed, new Date("2026-11-03T11:59:00Z"))).toBe(true);
  });
  test("not after 24 hours: a late install gets the sheet instead", () => {
    expect(onboardingApplies(welcomed, new Date("2026-11-03T12:01:00Z"))).toBe(false);
  });
  test("not a member welcomed before the cutoff, nor one never welcomed", () => {
    const before = new Date(ONBOARDING_FROM.getTime() - 1000);
    expect(onboardingApplies(before, new Date(before.getTime() + 1000))).toBe(false);
    expect(onboardingApplies(null, t0)).toBe(false);
  });
});

describe("who is asked", () => {
  test.each([
    ["not installed (Safari)", facts({ installed: false })],
    ["reminder already on", facts({ reminderOn: true })],
    ["notifications blocked", facts({ permission: "denied" })],
    ["no public key", facts({ hasKey: false })],
  ])("nobody: %s", (_why, f) => {
    expect(chooseAsk(memory(), t0, f, false)).toBe(null);
  });

  test("an existing member in the app gets the sheet, then the banner", () => {
    const storage = memory();
    expect(chooseAsk(storage, t0, facts(), false)).toBe("sheet");
    // Sheet closed (any way), then a later visit.
    storage().setItem("reminder-ask", JSON.stringify({ ...JSON.parse(storage().getItem("reminder-ask")!), sheetClosed: t0.getTime() }));
    expect(chooseAsk(storage, nextVisit(t0), facts(), false)).toBe("banner");
  });

  test("the sheet waits while another pop-up shows", () => {
    expect(chooseAsk(memory(), t0, facts(), true)).toBe(null);
  });
});

describe("a new member", () => {
  test("gets the step on the first open, once", () => {
    const storage = memory();
    expect(chooseAsk(storage, t0, facts({ onboarding: true }), false)).toBe("step");
    expect(chooseAsk(storage, t0, facts({ onboarding: true }), false)).toBe("step");
    leaveStep(storage);
    expect(chooseAsk(storage, t0, facts({ onboarding: true }), false)).toBe(null);
  });

  test("never gets the sheet after the step; the banner follows from the next visit", () => {
    const storage = memory();
    chooseAsk(storage, t0, facts({ onboarding: true }), false);
    leaveStep(storage);
    const next = nextVisit(t0);
    expect(chooseAsk(storage, next, facts({ onboarding: true }), false)).toBe("banner");
  });

  test("a step left with the reminder turned on shows nothing more", () => {
    const storage = memory();
    chooseAsk(storage, t0, facts({ onboarding: true }), false);
    leaveStep(storage);
    expect(chooseAsk(storage, nextVisit(t0), facts({ onboarding: true, reminderOn: true }), false)).toBe(null);
  });

  test("outside the window the same device gets the sheet (late install)", () => {
    expect(chooseAsk(memory(), t0, facts({ onboarding: false }), false)).toBe("sheet");
  });
});
