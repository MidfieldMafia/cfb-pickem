// @vitest-environment jsdom
/**
 * The Week list's max possible Weekly Score (#480): under each member's points
 * while the Week still has games to play, and gone once it is complete.
 * Plain DOM reads, as `picks/pick-flow.test.tsx` explains.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import type { WeeklyScore } from "@/lib/results/json";
import { WeeklyScoreList } from "./weekly-score";

afterEach(cleanup);

function score(id: number, points: number, maxPoints: number): WeeklyScore {
  return {
    member: { id, displayName: `Member ${id}`, avatarId: null },
    played: true,
    place: id,
    points,
    maxPoints,
    correct: points / 10,
    incorrect: 0,
    pending: 0,
    lockGameId: null,
    lockDropped: false,
    tiebreakerGuess: null,
    tiebreakerError: null,
  };
}

const scores = [score(1, 40, 90), score(2, 20, 110)];

function list(showMax: boolean) {
  render(<WeeklyScoreList scores={scores} winners={new Set()} viewerId={1} guessers={new Set()} showMax={showMax} />);
}

describe("the Week list's max possible Weekly Score", () => {
  test("shows each member's own max on their row while the Week is in play", () => {
    list(true);

    const rows = screen.getAllByRole("listitem");
    expect(rows[0].textContent).toContain("max 90");
    expect(rows[1].textContent).toContain("max 110");
  });

  test("shows none once the Week is complete", () => {
    list(false);

    expect(screen.getByText("40")).not.toBeNull();
    expect(screen.queryByText(/max/)).toBeNull();
  });
});
