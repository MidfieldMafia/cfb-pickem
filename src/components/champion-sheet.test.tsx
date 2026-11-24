// @vitest-environment jsdom
/**
 * The Regular Season Champion's celebration sheet (#592): what it says, Share
 * your win on the champion's sheet only, and every way of closing it marking
 * it seen once.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { ChampionSheet } from "./champion-sheet";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// jsdom has the element but not its modal API.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, "share");
});

const DEE = { id: 1, displayName: "Dee", avatarId: null };
const SAM = { id: 2, displayName: "Sam", avatarId: null };

function sheet({ mine = false, champions = [DEE], onSeen = vi.fn() } = {}) {
  render(<ChampionSheet year={2026} champions={champions} points={128} viewerIsChampion={mine} onSeen={onSeen} />);
  return { onSeen, dialog: screen.getByRole("dialog") };
}

const withShare = (share: (data: ShareData) => Promise<void>) =>
  Object.defineProperty(navigator, "share", { value: share, configurable: true });

describe("the sheet", () => {
  test("reads as a card of its own: the season, the title, and the name with points", () => {
    const { dialog } = sheet();
    expect(dialog.getAttribute("aria-label")).toBe("Dee is the Regular Season Champion");
    expect(dialog.textContent).toContain("Saturday Slate · 2026");
    expect(screen.getByRole("heading").textContent).toBe("Regular Season Champion");
    expect(dialog.textContent).toContain("Dee · 128 points");
    expect(dialog.textContent).not.toContain("over 13 Weeks");
    expect(dialog.textContent).not.toContain("clear");
  });

  test("names both co-champions", () => {
    const { dialog } = sheet({ champions: [DEE, SAM] });
    expect(screen.getByRole("heading").textContent).toBe("Regular Season Champions");
    expect(dialog.textContent).toContain("Dee and Sam · 128 points");
  });

  test("has no Share your win for a member who is not the champion", () => {
    withShare(vi.fn());
    sheet({ mine: false });
    expect(screen.queryByRole("button", { name: /share your win/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /copy/i })).toBeNull();
    expect(screen.getByRole("link", { name: "See the Leaderboard" }).getAttribute("href")).toBe("/leaderboard?week=season");
  });
});

describe("Share your win", () => {
  test("shares the champion's text and the Leaderboard, never the group", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    withShare(share);
    sheet({ mine: true });
    fireEvent.click(screen.getByRole("button", { name: "Share your win" }));
    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    expect(share).toHaveBeenCalledWith({
      title: "Regular Season Champion",
      text: "I'm the 2026 Saturday Slate Regular Season Champion with 128 points.",
      url: "http://localhost:3000/leaderboard?week=season",
    });
  });

  test("is a co-champion's own line on a shared title", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    withShare(share);
    sheet({ mine: true, champions: [DEE, SAM] });
    fireEvent.click(screen.getByRole("button", { name: "Share your win" }));
    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    expect(share.mock.calls[0][0].text).toBe("I'm a 2026 Saturday Slate Regular Season co-champion with 128 points.");
  });

  test("dismissing the picker changes nothing and shows no error", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("Share canceled", "AbortError"));
    withShare(share);
    const { dialog } = sheet({ mine: true });
    const before = dialog.textContent;
    fireEvent.click(screen.getByRole("button", { name: "Share your win" }));
    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(dialog.textContent).toBe(before);
    expect(dialog.hasAttribute("open")).toBe(true);
  });

  test("is a copy of the same text where the browser has no Web Share", () => {
    sheet({ mine: true });
    expect(screen.queryByRole("button", { name: "Share your win" })).toBeNull();
    expect(screen.getByRole("button", { name: "Copy your win" })).toBeTruthy();
  });
});

describe("closing it", () => {
  test("by Close marks it seen once", () => {
    const { onSeen, dialog } = sheet();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(onSeen).toHaveBeenCalledOnce();
  });

  test("by the scrim or See the Leaderboard marks it seen too", () => {
    const first = sheet();
    fireEvent.click(first.dialog);
    expect(first.onSeen).toHaveBeenCalledOnce();
    cleanup();

    const second = sheet();
    fireEvent.click(screen.getByRole("link", { name: "See the Leaderboard" }));
    expect(second.onSeen).toHaveBeenCalledOnce();
  });

  test("a click inside the sheet is not the scrim", () => {
    const { onSeen } = sheet();
    fireEvent.click(screen.getByRole("heading"));
    expect(onSeen).not.toHaveBeenCalled();
  });
});
