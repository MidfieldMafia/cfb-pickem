// @vitest-environment jsdom
/**
 * The Rivalry Week band (#588) shows only while the member layout hands down
 * the Look, and the launch screen learns the Look from what the member screens
 * last remembered. Plain DOM reads, as `live-board.test.tsx` explains.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { LOOK_KEY } from "@/lib/launch";
import { RivalryBand, RivalryTitle, WeekLookProvider } from "./week-look";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("RivalryBand", () => {
  test("reads RIVALRY WEEK between two hidden hairlines while the Look is on", () => {
    const { container } = render(
      <WeekLookProvider look="rivalry">
        <RivalryBand />
      </WeekLookProvider>,
    );
    expect(container.textContent).toBe("Rivalry Week");
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBe(2);
    expect(localStorage.getItem(LOOK_KEY)).toBe("rivalry");
  });

  test("renders nothing, and forgets the Look, while it is off", () => {
    localStorage.setItem(LOOK_KEY, "rivalry");
    const { container } = render(
      <WeekLookProvider look={null}>
        <RivalryBand />
      </WeekLookProvider>,
    );
    expect(container.innerHTML).toBe("");
    expect(localStorage.getItem(LOOK_KEY)).toBeNull();
  });

  test("renders nothing outside the member layout", () => {
    const { container } = render(<RivalryBand />);
    expect(container.innerHTML).toBe("");
  });
});

describe("RivalryTitle", () => {
  const eggBowl = { awayTeam: "Mississippi State", homeTeam: "Ole Miss" };
  const inLook = (look: "rivalry" | null, game: { awayTeam: string; homeTeam: string }, variant: "picks" | "sheet") =>
    render(
      <WeekLookProvider look={look}>
        <RivalryTitle game={game} variant={variant} />
      </WeekLookProvider>,
    ).container;

  test("bills a rivalry game by name and trophy on Picks, between the double rules", () => {
    const container = inLook("rivalry", eggBowl, "picks");
    expect(container.textContent).toBe("Egg BowlFor the Golden Egg");
    expect(container.firstElementChild?.className).toContain("border-double");
  });

  test("heads the game sheet with the name and trophy, and no rule", () => {
    const container = inLook("rivalry", eggBowl, "sheet");
    expect(container.textContent).toBe("Egg BowlFor the Golden Egg");
    expect(container.firstElementChild?.className).not.toContain("border");
  });

  test("shows the title alone for a rivalry with no trophy", () => {
    const container = inLook("rivalry", { awayTeam: "Auburn", homeTeam: "Alabama" }, "picks");
    expect(container.textContent).toBe("Iron Bowl");
  });

  test("renders nothing for an ordinary game, or while the Look is off", () => {
    expect(inLook("rivalry", { awayTeam: "Oklahoma", homeTeam: "Michigan" }, "picks").innerHTML).toBe("");
    cleanup();
    expect(inLook(null, eggBowl, "sheet").innerHTML).toBe("");
  });
});
