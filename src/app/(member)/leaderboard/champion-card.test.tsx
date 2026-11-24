// @vitest-environment jsdom
/**
 * The Regular Season Champion card (#589), design B: the title, each
 * champion's Pennant and name, their points, and "Corrected" only when a
 * Result Override is what crowned them. Plain DOM reads, as
 * `leaderboard-table.test.tsx` explains.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { ChampionCard } from "./champion-card";

afterEach(cleanup);

const DEE = { id: 1, displayName: "Dee", avatarId: null };
const SAM = { id: 2, displayName: "Sam", avatarId: null };

describe("ChampionCard", () => {
  test("names the champion with their points", () => {
    render(<ChampionCard champion={{ members: [DEE], points: 128, corrected: false }} />);
    const card = screen.getByRole("region", { name: "Dee is the Regular Season Champion" });
    expect(card.textContent).toContain("Regular Season Champion");
    expect(card.textContent).toContain("Dee");
    expect(card.textContent).toContain("128 points");
    expect(card.textContent).not.toContain("Corrected");
  });

  test("says Corrected when an override crowned them", () => {
    render(<ChampionCard champion={{ members: [DEE], points: 128, corrected: true }} />);
    expect(screen.getByRole("region").textContent).toContain("Corrected");
  });

  test("shows co-champions side by side", () => {
    render(<ChampionCard champion={{ members: [DEE, SAM], points: 128, corrected: false }} />);
    const card = screen.getByRole("region", { name: "Dee and Sam are the Regular Season Champions" });
    expect(card.textContent).toContain("Dee and Sam");
  });
});
