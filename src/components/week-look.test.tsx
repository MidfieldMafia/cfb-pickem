// @vitest-environment jsdom
/**
 * The Rivalry Week band (#588) shows only while the member layout hands down
 * the Look, and the launch screen learns the Look from what the member screens
 * last remembered. Plain DOM reads, as `live-board.test.tsx` explains.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { LOOK_KEY } from "@/lib/launch";
import { RivalryBand, WeekLookProvider } from "./week-look";

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
