// @vitest-environment jsdom
/**
 * The Regular Season Champion banner pinned at the top of Chat (#589): one
 * row naming the champion, a tap away from the Leaderboard's Season board.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { ChampionBanner } from "./champion-banner";

afterEach(cleanup);

const DEE = { id: 1, displayName: "Dee", avatarId: null };

describe("ChampionBanner", () => {
  test("names the champion and links to the season standings", () => {
    render(<ChampionBanner champion={{ members: [DEE], points: 128, corrected: false }} />);
    const link = screen.getByRole("link", { name: "Dee is the Regular Season Champion. See the Leaderboard" });
    expect(link.getAttribute("href")).toBe("/leaderboard?week=season");
    expect(link.textContent).toContain("Dee");
  });
});
