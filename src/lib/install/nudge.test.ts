import { describe, expect, test } from "vitest";
import { closeSheet, hideBanner, openPicks, stillHere, VISIT_GAP_MS } from "./nudge";

/** A `localStorage` stand-in that keeps what it is given. */
function memory() {
  const items = new Map<string, string>();
  const storage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
  return () => storage;
}

/** Storage that throws on every call, as a blocked or private window's can. */
const broken = () => {
  throw new Error("SecurityError");
};

/** Local wall-clock times, so the day boundary is the member's own. */
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute);
const later = (from: Date, ms: number) => new Date(from.getTime() + ms);

const QUIET = { popupShowing: false };
const BUSY = { popupShowing: true };

describe("the first visit", () => {
  test("shows the sheet", () => {
    expect(openPicks(memory(), at(24, 9), QUIET)).toBe("sheet");
  });

  test("waits for the next visit while another pop-up is showing", () => {
    const storage = memory();
    expect(openPicks(storage, at(24, 9), BUSY)).toBe(null);
    // Closing What's new and reloading is still the same visit.
    expect(openPicks(storage, later(at(24, 9), 60_000), QUIET)).toBe(null);
    expect(openPicks(storage, later(at(24, 9), 60_000 + VISIT_GAP_MS + 1), QUIET)).toBe("sheet");
  });

  test("shows the sheet again on a reload that did not close it", () => {
    const storage = memory();
    openPicks(storage, at(24, 9), QUIET);
    expect(openPicks(storage, at(24, 9, 1), QUIET)).toBe("sheet");
  });
});

describe("once the sheet is closed", () => {
  function closedAt(when: Date) {
    const storage = memory();
    openPicks(storage, when, QUIET);
    closeSheet(storage);
    return storage;
  }

  test("nothing more shows in the same visit", () => {
    const storage = closedAt(at(24, 9));
    expect(openPicks(storage, at(24, 9, 20), QUIET)).toBe(null);
  });

  test("the banner shows on the next visit, never the sheet", () => {
    const storage = closedAt(at(24, 9));
    expect(openPicks(storage, at(24, 10), QUIET)).toBe("banner");
    expect(openPicks(storage, at(25, 10), BUSY)).toBe("banner");
  });

  test("a visit lasts while Picks stays open, however long", () => {
    const storage = closedAt(at(24, 9));
    stillHere(storage, at(24, 9, 25));
    stillHere(storage, at(24, 9, 50));
    expect(openPicks(storage, at(24, 10, 15), QUIET)).toBe(null);
  });

  test("30 minutes away to the millisecond is still the same visit", () => {
    const storage = closedAt(at(24, 9));
    expect(openPicks(storage, later(at(24, 9), VISIT_GAP_MS), QUIET)).toBe(null);
  });
});

describe("the banner's X", () => {
  function bannerShowingAt(when: Date) {
    const storage = memory();
    openPicks(storage, at(when.getDate() - 1, 9), QUIET);
    closeSheet(storage);
    expect(openPicks(storage, when, QUIET)).toBe("banner");
    return storage;
  }

  test("hides it for the rest of the day", () => {
    const storage = bannerShowingAt(at(24, 9));
    hideBanner(storage, at(24, 9));
    expect(openPicks(storage, at(24, 9, 5), QUIET)).toBe(null);
    expect(openPicks(storage, at(24, 21), QUIET)).toBe(null);
  });

  test("brings it back on the first visit of the next day", () => {
    const storage = bannerShowingAt(at(24, 21));
    hideBanner(storage, at(24, 21));
    expect(openPicks(storage, at(25, 8), QUIET)).toBe("banner");
  });

  test("keeps it hidden past midnight within the same visit", () => {
    const storage = bannerShowingAt(at(24, 23, 50));
    hideBanner(storage, at(24, 23, 50));
    expect(openPicks(storage, at(25, 0, 5), QUIET)).toBe(null);
  });

  test("the first X still brings it back tomorrow", () => {
    const storage = bannerShowingAt(at(24, 9));
    hideBanner(storage, at(24, 9));
    expect(openPicks(storage, at(25, 9), QUIET)).toBe("banner");
  });

  test("the second X still brings it back tomorrow", () => {
    const storage = bannerShowingAt(at(24, 9));
    hideBanner(storage, at(24, 9));
    expect(openPicks(storage, at(25, 9), QUIET)).toBe("banner");
    hideBanner(storage, at(25, 9));
    expect(openPicks(storage, at(26, 9), QUIET)).toBe("banner");
  });

  test("the third X hides it for good", () => {
    const storage = bannerShowingAt(at(24, 9));
    hideBanner(storage, at(24, 9));
    expect(openPicks(storage, at(25, 9), QUIET)).toBe("banner");
    hideBanner(storage, at(25, 9));
    expect(openPicks(storage, at(26, 9), QUIET)).toBe("banner");
    hideBanner(storage, at(26, 9));
    expect(openPicks(storage, at(27, 9), QUIET)).toBe(null);
    expect(openPicks(storage, at(30, 9), BUSY)).toBe(null);
  });

  test("a third X on a later day than the second hides it for good", () => {
    const storage = bannerShowingAt(at(24, 9));
    hideBanner(storage, at(24, 9));
    expect(openPicks(storage, at(25, 9), QUIET)).toBe("banner");
    hideBanner(storage, at(25, 9));
    // A week goes by with the banner showing and no X.
    expect(openPicks(storage, at(26, 9), QUIET)).toBe("banner");
    expect(openPicks(storage, at(31, 9), QUIET)).toBe("banner");
    hideBanner(storage, at(31, 9));
    expect(openPicks(storage, at(31, 20), QUIET)).toBe(null);
    expect(openPicks(storage, new Date(2026, 10, 15, 9), QUIET)).toBe(null);
  });
});

describe("storage that throws", () => {
  test("shows nothing, rather than the sheet on every visit", () => {
    expect(openPicks(broken, at(24, 9), QUIET)).toBe(null);
  });

  test("never throws from a write", () => {
    expect(() => {
      stillHere(broken, at(24, 9));
      closeSheet(broken);
      hideBanner(broken, at(24, 9));
    }).not.toThrow();
  });
});
