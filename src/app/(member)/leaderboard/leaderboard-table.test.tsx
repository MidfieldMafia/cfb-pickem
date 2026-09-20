// @vitest-environment jsdom
/**
 * The sortable Leaderboard table (#134): clicking Pts, W–L, Wins, Avg, or
 * Miss sorts best-first, a second click reverses, the # column keeps each
 * member's real place regardless of order, and a fresh mount (a reload)
 * always starts from the default order. The Trophy is here too: it marks only
 * the member the page names as the season's champion, never the current leader.
 *
 * Assertions are plain DOM reads, not `@testing-library/jest-dom` matchers,
 * as `live-board.test.tsx` explains for this repo.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import type { LeaderboardRow } from "@/lib/results/results";
import { LeaderboardTable } from "./leaderboard-table";

afterEach(cleanup);

function member(id: number) {
  return { id, displayName: `Member ${id}`, avatarId: null };
}

function row(id: number, rank: number, overrides: Partial<LeaderboardRow> = {}): LeaderboardRow {
  return {
    member: member(id),
    rank,
    previousRank: null,
    totalPoints: 0,
    correct: 0,
    incorrect: 0,
    weeklyWins: 0,
    weeksPlayed: 1,
    averagePoints: 0,
    cumulativeTiebreakerError: 0,
    averageTiebreakerMiss: 0,
    ...overrides,
  };
}

/** Given out of points order, so a click is the only thing that can put them in points order. */
const ROWS: LeaderboardRow[] = [
  row(1, 2, { totalPoints: 20 }),
  row(2, 1, { totalPoints: 30 }),
  row(3, 3, { totalPoints: 10 }),
];

function renderedMemberOrder(): number[] {
  return screen.getAllByRole("row").slice(1).map((tr) => Number(tr.getAttribute("data-member-id")));
}

describe("default order", () => {
  test("renders the given rows in the order they arrived, with no active sort", () => {
    render(<LeaderboardTable rows={ROWS} viewerId={1} championId={null} />);
    expect(renderedMemberOrder()).toEqual([1, 2, 3]);
    expect(screen.getByRole("columnheader", { name: /Pts/ }).getAttribute("aria-sort")).toBe("none");
  });
});

describe("sorting by Pts", () => {
  test("first click sorts best-first: highest points first", () => {
    render(<LeaderboardTable rows={ROWS} viewerId={1} championId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Pts" }));
    expect(renderedMemberOrder()).toEqual([2, 1, 3]);
    // Best-first on Pts runs from the biggest number down, and the header says so.
    expect(screen.getByRole("columnheader", { name: /Pts/ }).getAttribute("aria-sort")).toBe("descending");
  });

  test("second click reverses it", () => {
    render(<LeaderboardTable rows={ROWS} viewerId={1} championId={null} />);
    const button = screen.getByRole("button", { name: "Pts" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(renderedMemberOrder()).toEqual([3, 1, 2]);
    expect(screen.getByRole("columnheader", { name: /Pts/ }).getAttribute("aria-sort")).toBe("ascending");
  });

  test("the # column keeps each member's real place, not their row position", () => {
    render(<LeaderboardTable rows={ROWS} viewerId={1} championId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Pts" }));
    const cells = screen.getAllByRole("row").slice(1).map((tr) => tr.querySelector("td")?.textContent?.trim());
    // Sorted order is member 2 (rank 1), member 1 (rank 2), member 3 (rank 3) — real ranks, unchanged by the sort.
    expect(cells).toEqual(["1", "2", "3"]);
  });

  test("a fresh mount starts back at the default order", () => {
    const { unmount } = render(<LeaderboardTable rows={ROWS} viewerId={1} championId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Pts" }));
    expect(renderedMemberOrder()).toEqual([2, 1, 3]);
    unmount();

    render(<LeaderboardTable rows={ROWS} viewerId={1} championId={null} />);
    expect(renderedMemberOrder()).toEqual([1, 2, 3]);
  });
});

describe("sort arrows", () => {
  test("only the sorted column shows an arrow, pointing the way its values run", () => {
    render(<LeaderboardTable rows={ROWS} viewerId={1} championId={null} />);
    expect(document.querySelectorAll("th svg").length).toBe(0);
    const button = screen.getByRole("button", { name: "Pts" });
    fireEvent.click(button);
    expect(button.querySelector("svg.lucide-arrow-down")).not.toBeNull();
    fireEvent.click(button);
    expect(button.querySelector("svg.lucide-arrow-up")).not.toBeNull();
    expect(document.querySelectorAll("th svg").length).toBe(1);
  });

  test("Miss is lower-is-better, so its best-first click points up", () => {
    render(<LeaderboardTable rows={ROWS} viewerId={1} championId={null} />);
    const button = screen.getByRole("button", { name: "Miss" });
    fireEvent.click(button);
    expect(button.querySelector("svg.lucide-arrow-up")).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: /Miss/ }).getAttribute("aria-sort")).toBe("ascending");
  });
});

describe("header tooltips", () => {
  test("each header is described by its own explanation", () => {
    render(<LeaderboardTable rows={ROWS} viewerId={1} championId={null} />);
    const button = screen.getByRole("button", { name: "Miss" });
    const tip = document.getElementById(button.getAttribute("aria-describedby")!);
    expect(tip?.textContent).toMatch(/Lower is better/);
  });

  test("hovering shows the tip, leaving hides it", () => {
    render(<LeaderboardTable rows={ROWS} viewerId={1} championId={null} />);
    const button = screen.getByRole("button", { name: "Avg" });
    expect(document.querySelectorAll(".fixed[aria-hidden]").length).toBe(0);
    fireEvent.mouseEnter(button);
    expect(document.querySelector("span.fixed[aria-hidden]")?.textContent).toMatch(/Average points per week/);
    fireEvent.mouseLeave(button);
    expect(document.querySelector("span.fixed[aria-hidden]")).toBeNull();
  });
});

describe("the Trophy", () => {
  /** Every row the board would mark as champion, by member id. */
  function trophies(): number[] {
    return screen
      .getAllByRole("row")
      .slice(1)
      .filter((tr) => tr.textContent?.includes("Season champion"))
      .map((tr) => Number(tr.getAttribute("data-member-id")));
  }

  test("marks the champion the page names", () => {
    render(<LeaderboardTable rows={ROWS} viewerId={1} championId={2} />);
    expect(trophies()).toEqual([2]);
  });

  test("marks nobody mid-season, even beside a clear leader", () => {
    render(<LeaderboardTable rows={ROWS} viewerId={1} championId={null} />);
    expect(trophies()).toEqual([]);
  });

  test("stays with the champion when the board is sorted another way", () => {
    render(<LeaderboardTable rows={ROWS} viewerId={1} championId={2} />);
    fireEvent.click(screen.getByRole("button", { name: "Pts" }));
    fireEvent.click(screen.getByRole("button", { name: "Pts" }));
    expect(trophies()).toEqual([2]);
  });
});

describe("sorting by Miss, where a dash sinks last in either direction", () => {
  const withADash: LeaderboardRow[] = [
    row(1, 1, { averageTiebreakerMiss: 4 }),
    row(2, 2, { averageTiebreakerMiss: null }),
    row(3, 3, { averageTiebreakerMiss: 1 }),
  ];

  test("first click sorts lowest-first, the dash last", () => {
    render(<LeaderboardTable rows={withADash} viewerId={1} championId={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Miss/ }));
    expect(renderedMemberOrder()).toEqual([3, 1, 2]);
  });

  test("second click reverses the placed rows, the dash still last", () => {
    render(<LeaderboardTable rows={withADash} viewerId={1} championId={null} />);
    const button = screen.getByRole("button", { name: /Miss/ });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(renderedMemberOrder()).toEqual([1, 3, 2]);
  });
});
