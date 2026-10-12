// @vitest-environment jsdom
/**
 * The tab bar's Tour anchors (#430). `BottomNav` draws its tiles twice, an
 * invisible spacer and the fixed bar, so a `data-tour` on the shared tile
 * would put every tab id on screen twice and the Tour could spotlight the
 * hidden copy. Each id is on the visible bar's link, once.
 *
 * Assertions are plain DOM reads, not `@testing-library/jest-dom` matchers,
 * as `live-board.test.tsx` explains for this repo.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BottomNav } from "./bottom-nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/picks" }));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ unread: 0 })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BottomNav's Tour anchors", () => {
  test.each(["tab-picks", "tab-live", "tab-leaderboard", "tab-chat"])("%s is on the visible bar's link, once", (id) => {
    const { container } = render(<BottomNav locked={false} picksOpen chatUnread={0} />);
    const anchors = container.querySelectorAll(`[data-tour="${id}"]`);
    expect(anchors).toHaveLength(1);
    expect(anchors[0].tagName).toBe("A");
    expect(anchors[0].closest("nav")).not.toBeNull();
  });

  test("the Picks tab keeps its anchor once the Week locks", () => {
    const { container } = render(<BottomNav locked picksOpen={false} chatUnread={0} />);
    const anchors = container.querySelectorAll('[data-tour="tab-picks"]');
    expect(anchors).toHaveLength(1);
    expect(anchors[0].getAttribute("href")).toBe("/picks/review");
  });
});
