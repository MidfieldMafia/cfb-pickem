// @vitest-environment jsdom
/**
 * The countdown that decides whether a member's phone paints the locked state.
 * A phone clock can be minutes or days wrong, so the hook counts down to the
 * Deadline on the *server's* clock — the offset it measures on arrival — and
 * these tests are about that offset rather than about the rendering.
 *
 * The phone clock is faked and the server clock is not: `serverNow` is a
 * string the server sent, so the two move independently on purpose.
 */
import { act, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { formatCountdown, useDeadlineClock } from "./clock";

/** Friday's Miami kickoff, the Deadline in the Week 2 fixture. */
const DEADLINE = "2026-09-11T00:00:00.000Z";
/** Two hours before it, on the server's clock. */
const SERVER_NOW = "2026-09-10T22:00:00.000Z";
const TWO_HOURS = 2 * 60 * 60 * 1000;

/** Pins the *phone's* clock. `Date` parsing and arithmetic stay intact. */
function phoneClockAt(iso: string) {
  vi.useFakeTimers({ now: new Date(iso) });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useDeadlineClock", () => {
  test("counts down to the Deadline when the phone agrees with the server", () => {
    phoneClockAt(SERVER_NOW);

    const { result } = renderHook(() => useDeadlineClock(DEADLINE, SERVER_NOW));

    expect(result.current.remainingMs).toBe(TWO_HOURS);
    expect(result.current.passed).toBe(false);
  });

  test("a phone running hours fast still counts down to the real Deadline", () => {
    // This phone thinks it is well past the Deadline. Naive `Date.now()` math
    // would lock the member out of a sheet that is still open.
    phoneClockAt("2026-09-11T06:00:00.000Z");

    const { result } = renderHook(() => useDeadlineClock(DEADLINE, SERVER_NOW));

    expect(result.current.remainingMs).toBe(TWO_HOURS);
    expect(result.current.passed).toBe(false);
  });

  test("a phone running days slow does not hold a passed Deadline open", () => {
    phoneClockAt("2026-09-09T12:00:00.000Z");

    const { result } = renderHook(() => useDeadlineClock(DEADLINE, "2026-09-11T00:00:30.000Z"));

    expect(result.current.remainingMs).toBe(-30_000);
    expect(result.current.passed).toBe(true);
  });

  test("ticks once a second, on the server's clock", () => {
    phoneClockAt(SERVER_NOW);

    const { result } = renderHook(() => useDeadlineClock(DEADLINE, SERVER_NOW));
    act(() => void vi.advanceTimersByTime(3000));

    expect(result.current.remainingMs).toBe(TWO_HOURS - 3000);
  });

  test("crosses the Deadline as the clock reaches it", () => {
    phoneClockAt("2026-09-10T23:59:58.000Z");

    const { result } = renderHook(() => useDeadlineClock(DEADLINE, "2026-09-10T23:59:58.000Z"));
    expect(result.current.passed).toBe(false);

    act(() => void vi.advanceTimersByTime(2000));

    expect(result.current.remainingMs).toBe(0);
    expect(result.current.passed).toBe(true);
  });

  test("sync re-measures the offset from a fresher server clock", () => {
    // The phone is an hour fast; the measurement on arrival corrects for it.
    phoneClockAt("2026-09-10T23:00:00.000Z");
    const { result } = renderHook(() => useDeadlineClock(DEADLINE, SERVER_NOW));
    expect(result.current.remainingMs).toBe(TWO_HOURS);

    // A save answers with a server clock half an hour further on while the
    // phone's clock has not moved. The fresher reading is what wins.
    act(() => result.current.sync("2026-09-10T22:30:00.000Z"));

    expect(result.current.remainingMs).toBe(90 * 60 * 1000);
  });

  test("the offset is measured on arrival, not re-measured on every render", () => {
    phoneClockAt(SERVER_NOW);
    const { result, rerender } = renderHook(
      ({ serverNow }: { serverNow: string }) => useDeadlineClock(DEADLINE, serverNow),
      { initialProps: { serverNow: SERVER_NOW } },
    );

    // A re-render carrying a stale `serverNow` must not drag the countdown
    // backwards. Only `sync` moves the offset.
    act(() => void vi.advanceTimersByTime(60_000));
    rerender({ serverNow: "2026-09-10T12:00:00.000Z" });

    expect(result.current.remainingMs).toBe(TWO_HOURS - 60_000);
  });

  test("hydration keeps the server's answer, so a skewed phone never flashes the locked state", () => {
    const Countdown = () => {
      const { passed, remainingMs } = useDeadlineClock(DEADLINE, SERVER_NOW);
      return createElement("span", null, `${passed ? "locked" : "open"} ${formatCountdown(remainingMs)}`);
    };

    // What the server sends. No phone clock is involved.
    const html = renderToString(createElement(Countdown));
    expect(html).toContain("open 02h 00m 00s");

    // Hydrating on a phone that thinks the Deadline is nine days gone must
    // produce the same markup; a mismatch here is React throwing the tree away
    // and the member seeing a locked screen for a frame.
    phoneClockAt("2026-09-20T00:00:00.000Z");
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);
    const complaints: unknown[][] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void complaints.push(args));

    act(() => void hydrateRoot(container, createElement(Countdown)));

    expect(container.textContent).toBe("open 02h 00m 00s");
    expect(complaints).toEqual([]);
  });
});

describe("formatCountdown", () => {
  test("pads to a stable width so the countdown does not jitter", () => {
    expect(formatCountdown(0)).toBe("00h 00m 00s");
    expect(formatCountdown(8_000)).toBe("00h 00m 08s");
    expect(formatCountdown(TWO_HOURS)).toBe("02h 00m 00s");
    expect(formatCountdown(23 * 3_600_000 + 59 * 60_000 + 59_000)).toBe("23h 59m 59s");
  });

  test("shows days only once there is a day to show", () => {
    expect(formatCountdown(24 * 3_600_000 - 1000)).toBe("23h 59m 59s");
    expect(formatCountdown(24 * 3_600_000)).toBe("1d 00h 00m 00s");
    expect(formatCountdown(30 * 3_600_000 + 40 * 60_000 + 8_000)).toBe("1d 06h 40m 08s");
    expect(formatCountdown(7 * 24 * 3_600_000)).toBe("7d 00h 00m 00s");
  });

  test("floors, so a partial second reads as the second it is in", () => {
    expect(formatCountdown(1_999)).toBe("00h 00m 01s");
  });

  test("a passed Deadline reads as zero rather than counting up", () => {
    expect(formatCountdown(-1)).toBe("00h 00m 00s");
    expect(formatCountdown(-90_000)).toBe("00h 00m 00s");
  });
});
