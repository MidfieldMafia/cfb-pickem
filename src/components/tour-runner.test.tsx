// @vitest-environment jsdom
/**
 * The Tour runner (#431, spec #426): which Stop shows first, what its card
 * offers, how a tap Stop moves tab, and that every way of ending dismisses
 * once and is counted. The page is a stand-in: the `data-tour` anchors the
 * real screens render, without the screens.
 *
 * Assertions are plain DOM reads, not `@testing-library/jest-dom` matchers,
 * as `live-board.test.tsx` explains for this repo.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { tours, type Tour, type TourTarget } from "@/tours/tours";
import { TourRunner } from "./tour-runner";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const track = vi.fn();
vi.mock("@/lib/analytics/analytics", () => ({ track: (...args: unknown[]) => track(...args) }));

beforeAll(() => {
  // jsdom's <dialog> may lack the modal methods; the runner only needs `open`.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

const TABS: [TourTarget, string][] = [
  ["tab-picks", "/picks"],
  ["tab-live", "/live"],
  ["tab-leaderboard", "/leaderboard"],
  ["tab-chat", "/chat"],
];

/** The nav, the header icons and one screen's content area. */
function Page({ screen: content }: { screen?: TourTarget }) {
  return (
    <div>
      <a data-tour="pennant" href="#menu">
        Pennant
      </a>
      <a data-tour="rules" href="/rules">
        How to play
      </a>
      {content && <main data-tour={content}>Screen</main>}
      <nav>
        {TABS.map(([tour, href]) => (
          <a key={tour} data-tour={tour} href={href}>
            {tour}
          </a>
        ))}
      </nav>
    </div>
  );
}

function landOn(pathname: string) {
  window.history.replaceState({}, "", pathname);
}

const dialog = () => document.querySelector("dialog")!;
const card = () => screen.getByRole("heading", { level: 2 }).textContent;
const count = () => screen.getByText(/ of \d+$/).textContent;
const button = (name: string) => screen.queryByRole("button", { name });

beforeEach(() => {
  push.mockReset();
  track.mockReset();
});

afterEach(() => {
  cleanup();
  document.documentElement.style.overflow = "";
});

describe("the first Stop", () => {
  test("landing on the Leaderboard starts at Picks' tap Stop, with no Next and no Back", async () => {
    landOn("/leaderboard");
    render(
      <>
        <Page screen="leaderboard-screen" />
        <TourRunner tour={tours.welcome} dismiss={vi.fn(async () => {})} />
      </>,
    );
    await waitFor(() => expect(card()).toBe("Picks"));
    expect(count()).toBe("1 of 10");
    expect(button("Next")).toBeNull();
    expect(button("Back")).toBeNull();
    expect(button("Skip")).not.toBeNull();
    expect(dialog().open).toBe(true);
  });

  test("landing on Picks drops Picks' tap Stop and starts on its screen Stop", async () => {
    landOn("/picks");
    render(
      <>
        <Page screen="picks-screen" />
        <TourRunner tour={tours.welcome} dismiss={vi.fn(async () => {})} />
      </>,
    );
    await waitFor(() => expect(card()).toBe("Pick every game"));
    expect(count()).toBe("1 of 9");
    expect(button("Next")).not.toBeNull();
    expect(button("Back")).toBeNull();
  });

  test("a missing target is dropped and n of N recounts", async () => {
    // On Picks, with no Picks screen anchor: both Picks Stops go.
    landOn("/picks/review");
    render(
      <>
        <Page />
        <TourRunner tour={tours.welcome} dismiss={vi.fn(async () => {})} />
      </>,
    );
    await waitFor(() => expect(card()).toBe("Live Board"));
    expect(count()).toBe("1 of 8");
  });

  test("it doesn't start over an open sheet", async () => {
    landOn("/leaderboard");
    render(
      <>
        <Page screen="leaderboard-screen" />
        <div data-vaul-drawer="" data-state="open" />
        <TourRunner tour={tours.welcome} dismiss={vi.fn(async () => {})} />
      </>,
    );
    await act(async () => {});
    expect(document.querySelector("dialog")).toBeNull();
  });

  test("the page under it doesn't scroll while it runs", async () => {
    landOn("/leaderboard");
    render(
      <>
        <Page screen="leaderboard-screen" />
        <TourRunner tour={tours.welcome} dismiss={vi.fn(async () => {})} />
      </>,
    );
    await waitFor(() => expect(document.documentElement.style.overflow).toBe("hidden"));
  });
});

describe("moving on", () => {
  test("tapping a tap Stop's tab goes to its href, then waits for that tab's screen", async () => {
    landOn("/leaderboard");
    const view = render(
      <>
        <Page screen="leaderboard-screen" />
        <TourRunner tour={tours.welcome} dismiss={vi.fn(async () => {})} />
      </>,
    );
    await waitFor(() => expect(card()).toBe("Picks"));
    fireEvent.click(screen.getByRole("button", { name: "Go to Picks" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/picks"));

    landOn("/picks");
    view.rerender(
      <>
        <Page screen="picks-screen" />
        <TourRunner tour={tours.welcome} dismiss={vi.fn(async () => {})} />
      </>,
    );
    await waitFor(() => expect(card()).toBe("Pick every game"));
    expect(count()).toBe("2 of 10");
  });

  test("a tab whose screen never comes drops its screen Stop and goes on", async () => {
    landOn("/leaderboard");
    render(
      <>
        <Page screen="leaderboard-screen" />
        <TourRunner tour={tours.welcome} dismiss={vi.fn(async () => {})} />
      </>,
    );
    await waitFor(() => expect(card()).toBe("Picks"));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fireEvent.click(screen.getByRole("button", { name: "Go to Picks" }));
      landOn("/picks");
      // The Picks screen never renders its anchor: after 3s its Stop goes.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3500);
      });
      await waitFor(() => expect(card()).toBe("Live Board"));
      expect(count()).toBe("2 of 9");
    } finally {
      vi.useRealTimers();
    }
  });

  test("Next and Back walk Stops on the same screen", async () => {
    landOn("/chat");
    render(
      <>
        <Page screen="chat-screen" />
        <TourRunner tour={{ id: "welcome", stops: tours.welcome.stops.slice(7) }} dismiss={vi.fn(async () => {})} />
      </>,
    );
    await waitFor(() => expect(card()).toBe("Talk it over"));
    fireEvent.click(button("Next")!);
    await waitFor(() => expect(card()).toBe("Your Pennant"));
    fireEvent.click(button("Back")!);
    await waitFor(() => expect(card()).toBe("Talk it over"));
  });
});

describe("ending the Tour", () => {
  const tail: Tour = { id: "welcome", stops: tours.welcome.stops.slice(8) };

  async function start() {
    const dismiss = vi.fn(async () => {});
    landOn("/chat");
    render(
      <>
        <Page screen="chat-screen" />
        <TourRunner tour={tail} dismiss={dismiss} />
      </>,
    );
    await waitFor(() => expect(card()).toBe("Your Pennant"));
    return dismiss;
  }

  test("Done on the last Stop dismisses once and tracks done", async () => {
    const dismiss = await start();
    fireEvent.click(button("Next")!);
    await waitFor(() => expect(button("Done")).not.toBeNull());
    fireEvent.click(button("Done")!);
    await waitFor(() => expect(dismiss).toHaveBeenCalledTimes(1));
    expect(dismiss).toHaveBeenCalledWith("welcome");
    expect(track).toHaveBeenCalledExactlyOnceWith("tour_ended", { how: "done", stop: "rules", position: 2, of: 2 });
    expect(document.querySelector("dialog")).toBeNull();
    expect(document.documentElement.style.overflow).toBe("");
  });

  test("Skip dismisses once and tracks skip", async () => {
    const dismiss = await start();
    fireEvent.click(button("Skip")!);
    await waitFor(() => expect(dismiss).toHaveBeenCalledTimes(1));
    expect(track).toHaveBeenCalledExactlyOnceWith("tour_ended", { how: "skip", stop: "pennant", position: 1, of: 2 });
  });

  test("Escape dismisses once and tracks close", async () => {
    const dismiss = await start();
    const open = dialog();
    act(() => {
      // Twice in one tick, before React unmounts it: the second is a no-op.
      open.dispatchEvent(new Event("cancel", { cancelable: true }));
      open.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    await waitFor(() => expect(dismiss).toHaveBeenCalledTimes(1));
    expect(track).toHaveBeenCalledExactlyOnceWith("tour_ended", { how: "close", stop: "pennant", position: 1, of: 2 });
  });

  test("a failed write still ends the Tour for this page", async () => {
    const dismiss = await start();
    dismiss.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(button("Skip")!);
    await waitFor(() => expect(document.querySelector("dialog")).toBeNull());
  });

  test("a Tour with no target left ends as done", async () => {
    const dismiss = vi.fn(async () => {});
    landOn("/chat");
    render(<TourRunner tour={tail} dismiss={dismiss} />);
    await waitFor(() => expect(dismiss).toHaveBeenCalledTimes(1));
    expect(track).toHaveBeenCalledWith("tour_ended", expect.objectContaining({ how: "done" }));
    expect(document.querySelector("dialog")).toBeNull();
  });
});
