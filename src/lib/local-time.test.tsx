// @vitest-environment jsdom
/**
 * `LocalTime` on an iPhone. The server renders the time in UTC and the phone's
 * hydration pass formats the same UTC time again, so the two must produce the
 * same text — but WebKit's ICU joins a date to a time with " at " where
 * Node's joins it with ", ". That one word was React #418 on every cold launch
 * into Picks (#515).
 *
 * WebKit is played by a `DateTimeFormat` that swaps in its joiner, as
 * JavaScriptCore does for `{ weekday, month, day, hour, minute }`:
 * "Sat, Sep 26 at 4:00 PM". Every other part agrees across the two engines.
 * The component is imported fresh after the swap, because its formatters are
 * built once per module and kept.
 */
import { createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { act } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { TimeStyle } from "../../packages/design-system/src/local-time";

/** A 3:30 PM Central kickoff. */
const KICKOFF = "2026-09-26T20:30:00.000Z";

const NodeDateTimeFormat = Intl.DateTimeFormat;

class WebKitDateTimeFormat extends NodeDateTimeFormat {
  formatToParts(date?: Date | number): Intl.DateTimeFormatPart[] {
    const parts = super.formatToParts(date);
    return parts.map((part, i) =>
      part.type === "literal" && parts[i - 1]?.type === "day" && parts[i + 1]?.type === "hour"
        ? { ...part, value: " at " }
        : part,
    );
  }
  /** Both engines' `format()` put a plain space before PM, whatever their parts say. */
  format(date?: Date | number): string {
    return this.formatToParts(date)
      .map((part) => part.value)
      .join("")
      .replace(/ /g, " ");
  }
}

async function freshLocalTime() {
  vi.resetModules();
  return (await import("../../packages/design-system/src/local-time")).LocalTime;
}

afterEach(() => {
  Intl.DateTimeFormat = NodeDateTimeFormat;
  document.body.innerHTML = "";
});

describe("LocalTime on WebKit", () => {
  test("the stand-in writes a kickoff the way an iPhone does", () => {
    const options = { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" } as const;
    expect(new WebKitDateTimeFormat("en-US", options).format(new Date(KICKOFF))).toBe("Sat, Sep 26 at 8:30 PM");
  });

  test.each<TimeStyle>(["kickoff", "deadline", "slot"])("a %s time hydrates without a mismatch", async (style) => {
    const ServerLocalTime = await freshLocalTime();
    const html = renderToString(createElement(ServerLocalTime, { at: KICKOFF, style }));

    Intl.DateTimeFormat = WebKitDateTimeFormat as typeof Intl.DateTimeFormat;
    const PhoneLocalTime = await freshLocalTime();
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);
    const mismatches: unknown[] = [];
    await act(async () => {
      hydrateRoot(container, createElement(PhoneLocalTime, { at: KICKOFF, style }), {
        onRecoverableError: (error) => mismatches.push(error),
      });
    });

    expect(mismatches).toEqual([]);
  });

  test("an iPhone shows the same words as every other browser", async () => {
    Intl.DateTimeFormat = WebKitDateTimeFormat as typeof Intl.DateTimeFormat;
    const LocalTime = await freshLocalTime();
    const html = renderToString(createElement(LocalTime, { at: KICKOFF, style: "deadline" }));

    expect(html).toContain("Sat, Sep 26, 8:30 PM UTC");
  });
});
