// @vitest-environment jsdom
/**
 * The sortable Leaderboard table (#134): clicking Pts, Win%, Wins, or
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
import type { LeaderboardRow } from "@/lib/results/json";
import { LeaderboardTable } from "./leaderboard-table";

afterEach(cleanup);

function member(id: number) {
  return { id, displayName: `Member ${id}`, avatarId: null };
}

function row(id: number, rank: number, overrides: Partial<LeaderboardRow> = {}): LeaderboardRow {
  return {
    member: member(id),
    active: true,
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
    const arrows = () => document.querySelectorAll("th svg.lucide-arrow-up, th svg.lucide-arrow-down").length;
    render(<LeaderboardTable rows={ROWS} viewerId={1} championId={null} />);
    expect(arrows()).toBe(0);
    const button = screen.getByRole("button", { name: "Pts" });
    fireEvent.click(button);
    expect(button.querySelector("svg.lucide-arrow-down")).not.toBeNull();
    fireEvent.click(button);
    expect(button.querySelector("svg.lucide-arrow-up")).not.toBeNull();
    expect(arrows()).toBe(1);
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

  test("Wins shows the trophy in place of its word, still named and explained (#336)", () => {
    render(<LeaderboardTable rows={ROWS} viewerId={1} championId={null} />);
    const button = screen.getByRole("button", { name: "Weekly wins" });
    // The word itself is screen-reader-only text; what shows is the trophy.
    expect(button.querySelector(".sr-only")?.textContent).toBe("Weekly wins");
    expect(button.querySelector("svg")).not.toBeNull();
    const tip = document.getElementById(button.getAttribute("aria-describedby")!);
    expect(tip?.textContent).toMatch(/^Weekly Wins:/);
  });

  test("the trophy header still sorts, most Weekly Wins first", () => {
    const rows = [row(1, 1, { weeklyWins: 1 }), row(2, 2, { weeklyWins: 3 }), row(3, 3, { weeklyWins: 2 })];
    render(<LeaderboardTable rows={rows} viewerId={1} championId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Weekly wins" }));
    expect(renderedMemberOrder()).toEqual([2, 3, 1]);
    expect(screen.getByRole("columnheader", { name: /Weekly wins/ }).getAttribute("aria-sort")).toBe("descending");
  });

  test("hovering shows the tip, leaving hides it", () => {
    render(<LeaderboardTable rows={ROWS} viewerId={1} championId={null} />);
    const button = screen.getByRole("button", { name: "Win%" });
    expect(document.querySelectorAll(".fixed[aria-hidden]").length).toBe(0);
    fireEvent.mouseEnter(button);
    expect(document.querySelector("span.fixed[aria-hidden]")?.textContent).toMatch(/share of your picks that were correct/);
    fireEvent.mouseLeave(button);
    expect(document.querySelector("span.fixed[aria-hidden]")).toBeNull();
  });
});

describe("Win%, in place of W–L (#336)", () => {
  test("shows each row's correct share as a whole percent, a dash before any graded pick", () => {
    const rows = [row(1, 1, { correct: 34, incorrect: 21 }), row(2, 2)];
    render(<LeaderboardTable rows={rows} viewerId={1} championId={null} />);
    const headers = screen.getAllByRole("columnheader").map((th) => th.querySelector("button")?.textContent ?? th.textContent);
    const col = headers.indexOf("Win%");
    const cells = screen.getAllByRole("row").slice(1).map((tr) => tr.querySelectorAll("td")[col].textContent);
    expect(cells).toEqual(["62%", "—"]);
  });

  test("there is no W–L or Avg column any more", () => {
    render(<LeaderboardTable rows={ROWS} viewerId={1} championId={null} />);
    expect(screen.queryByRole("button", { name: "W–L" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Avg" })).toBeNull();
  });
});

describe("the viewer's row", () => {
  test("is highlighted, with 'you' left to screen readers rather than shown (#336)", () => {
    render(<LeaderboardTable rows={ROWS} viewerId={1} championId={null} />);
    const mine = document.querySelector('tr[data-member-id="1"]')!;
    expect(mine.className).toMatch(/bg-muted/);
    expect(mine.querySelector(".sr-only")?.textContent).toBe("(you)");
    expect([...mine.querySelectorAll("span:not(.sr-only)")].some((s) => s.textContent === "you")).toBe(false);
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

describe("the still-alive mark", () => {
  /** The mark on each row, by member id: null where a row has none. */
  function marks(): Record<number, string | null> {
    return Object.fromEntries(
      screen
        .getAllByRole("row")
        .slice(1)
        .map((tr) => [Number(tr.getAttribute("data-member-id")), tr.querySelector("[data-still-alive]")?.textContent ?? null]),
    );
  }

  test("sits under the name of each member alive", () => {
    render(<LeaderboardTable rows={ROWS} viewerId={1} championId={null} stillAlive={{ alive: [1, 2], clinched: false }} />);
    expect(marks()).toEqual({ 1: "Still alive", 2: "Still alive", 3: null });
  });

  test("reads Clinched the title for a sole survivor, heavier and on one line", () => {
    render(<LeaderboardTable rows={ROWS} viewerId={1} championId={null} stillAlive={{ alive: [2], clinched: true }} />);
    expect(marks()).toEqual({ 1: null, 2: "Clinched the title", 3: null });
    const mark = document.querySelector("[data-still-alive]")!;
    expect(mark.className).toMatch(/font-extrabold/);
    expect(mark.className).toMatch(/whitespace-nowrap/);
  });

  test("is set in the rust caps the design names, at weight 700 for Still alive", () => {
    render(<LeaderboardTable rows={ROWS} viewerId={1} championId={null} stillAlive={{ alive: [1], clinched: false }} />);
    const { className } = document.querySelector("[data-still-alive]")!;
    for (const token of ["text-[11px]", "leading-[14px]", "tracking-[0.08em]", "text-secondary", "uppercase", "font-bold"]) {
      expect(className).toContain(token);
    }
  });

  test("is absent with no mark, and stays with its member when the board is sorted", () => {
    render(<LeaderboardTable rows={ROWS} viewerId={1} championId={null} />);
    expect(marks()).toEqual({ 1: null, 2: null, 3: null });
    cleanup();
    render(<LeaderboardTable rows={ROWS} viewerId={1} championId={null} stillAlive={{ alive: [3], clinched: true }} />);
    fireEvent.click(screen.getByRole("button", { name: "Pts" }));
    expect(marks()).toEqual({ 1: null, 2: null, 3: "Clinched the title" });
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
