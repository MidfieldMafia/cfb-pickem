/**
 * Share your win (#592): the text the champion sends, and the Web Share call
 * behind the button, where a dismissed picker is nothing at all.
 */
import { describe, expect, test, vi } from "vitest";
import { shareText, shareWin } from "./share";

describe("the text", () => {
  test("names the title and the points, and never the group", () => {
    expect(shareText({ year: 2026, points: 128, co: false })).toBe(
      "I'm the 2026 Saturday Slate Regular Season Champion with 128 points.",
    );
  });

  test("is a co-champion's when the title is shared", () => {
    expect(shareText({ year: 2026, points: 128, co: true })).toBe(
      "I'm a 2026 Saturday Slate Regular Season co-champion with 128 points.",
    );
  });
});

describe("sharing", () => {
  const data = { title: "Regular Season Champion", text: "I'm the champion.", url: "https://example.test/leaderboard" };

  test("hands the title, text and Leaderboard link to the share picker", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    expect(await shareWin(share, data)).toBe("shared");
    expect(share).toHaveBeenCalledWith(data);
  });

  test("treats a dismissed picker as nothing having happened", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("Share canceled", "AbortError"));
    expect(await shareWin(share, data)).toBe("cancelled");
  });

  test("reports any other failure, for the button to fall back to copying", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("Not allowed", "NotAllowedError"));
    expect(await shareWin(share, data)).toBe("failed");
  });
});
