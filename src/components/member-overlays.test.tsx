// @vitest-environment jsdom
/**
 * The Welcome Tour and the What's new modal on a landing (#431, spec #426):
 * where the Tour starts, the modal stays shut and its entry is marked seen;
 * where it doesn't — dismissed, or a failed read — the modal behaves as ever.
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { WHATS_NEW_KEY } from "@/lib/whats-new";
import { MemberOverlays } from "./member-overlays";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/analytics/analytics", () => ({ track: vi.fn() }));
vi.mock("@/app/(member)/actions", () => ({ dismissTourAction: vi.fn(async () => {}) }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, "", "/leaderboard");
});

afterEach(cleanup);

const whatsNew = () => document.querySelector<HTMLDialogElement>('dialog[aria-labelledby="whats-new-title"]')!;
const tour = () => document.querySelector('dialog[aria-labelledby="tour-stop-title"]');

/** The Picks tab, so the Tour has a first Stop to show. */
const Nav = () => <a data-tour="tab-picks" href="/picks" />;

describe("a landing where the Welcome Tour starts", () => {
  test("keeps What's new shut and marks its entry seen", async () => {
    render(
      <>
        <Nav />
        <MemberOverlays welcomeTour />
      </>,
    );
    await waitFor(() => expect(tour()).not.toBeNull());
    expect(screen.getByRole("heading", { name: "Picks" })).not.toBeNull();
    expect(whatsNew().open).toBe(false);
    expect(window.localStorage.getItem(WHATS_NEW_KEY)).not.toBeNull();
  });
});

describe("a landing without it", () => {
  test("shows no Tour when the dismissal is there, or its read failed", async () => {
    render(
      <>
        <Nav />
        <MemberOverlays welcomeTour={false} />
      </>,
    );
    await act(async () => {});
    expect(tour()).toBeNull();
  });

  test("opens What's new as before", async () => {
    render(<MemberOverlays welcomeTour={false} />);
    await waitFor(() => expect(whatsNew().open).toBe(true));
  });
});
