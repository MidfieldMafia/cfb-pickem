"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, SECTION_LABEL } from "@saturday-slate/design-system";
import { track } from "@/lib/analytics/analytics";
import type { TourId } from "@/tours/ids";
import { back, controls, current, drop, next, onTab, position, startRun, tabHref, type Run } from "@/tours/run";
import { findTarget, sheetOpen, waitForTarget } from "@/tours/targets";
import type { Stop, Tour, TourTarget } from "@/tours/tours";

/** After a tab move, how long the new screen has to render a Stop's target. */
const TARGET_WAIT_MS = 3000;
/** How long the hole takes to shut before a tab move. */
const SHUT_MS = 260;
/** The hole's padding round its target, and how close it may come to the screen's edge. */
const PAD = 6;
const EDGE = 4;
/** The card's gap from the hole, and the room it needs below the hole to sit there. */
const GAP = 12;
const CARD_ROOM = 190;
/** Targets spotlighted as a circle rather than a rounded box. */
const ROUND: readonly TourTarget[] = ["pennant", "rules"];

/** The spotlight, in viewport pixels. `vh` is the viewport it was measured in. */
type Hole = { x: number; y: number; w: number; h: number; round: boolean; vh: number };

type View = { run: Run; hole: Hole; shut: boolean; jump: boolean };

function measure(element: HTMLElement, stop: Stop): Hole {
  const box = element.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (ROUND.includes(stop.target)) {
    const side = Math.max(box.width, box.height) + PAD * 2;
    return { x: box.left + box.width / 2 - side / 2, y: box.top + box.height / 2 - side / 2, w: side, h: side, round: true, vh };
  }
  // A screen target runs past the viewport and under the fixed nav; the hole
  // stops at the screen's edges and the nav's top, so the ring stays visible
  // and frames only the screen.
  const nav = findTarget("tab-picks")?.closest("nav");
  const floor = nav && !nav.contains(element) ? nav.getBoundingClientRect().top : vh;
  const left = Math.max(EDGE, box.left - PAD);
  const top = Math.max(EDGE, box.top - PAD);
  const right = Math.min(vw - EDGE, box.right + PAD);
  const bottom = Math.min(floor - EDGE, box.bottom + PAD);
  return { x: left, y: top, w: Math.max(0, right - left), h: Math.max(0, bottom - top), round: false, vh };
}

/**
 * Below the hole when there's room, else above it, else over the bottom of
 * the screen — a screen Stop's hole fills most of it, and the card may cover
 * the dimmed nav.
 */
function cardPlace({ y, h, vh }: Hole): { top?: number; bottom?: number | string } {
  if (y + h + GAP + CARD_ROOM <= vh) return { top: y + h + GAP };
  if (y - GAP - CARD_ROOM >= 0) return { bottom: vh - y + GAP };
  return { bottom: "calc(16px + env(safe-area-inset-bottom))" };
}

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * The Tour runner (#431, spec #426): a native `<dialog>` opened with
 * `showModal()`, so it sits in the top layer above the nav, Vaul sheets and
 * the What's new modal, and the page behind it is inert — VoiceOver can't
 * leave a Stop. The dim is the hole's own shadow; the hole is a transparent
 * button over the target, so tapping the target is Next (on a tap Stop, the
 * tab move), and a tap Stop, which has no Next, can still be reached by
 * keyboard and screen reader.
 *
 * It mounts in the `(member)` layout, which stays mounted across tab moves,
 * so a move the Tour asks for doesn't restart it; a reload does, from Stop 1.
 * Done, Skip and Escape each dismiss once. A failed dismissal still ends the
 * Tour here: this component's state is the page session's memory of it.
 */
export function TourRunner({ tour, dismiss }: { tour: Tour; dismiss: (tourId: TourId) => Promise<void> }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const holeButton = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const target = useRef<HTMLElement | null>(null);
  const generation = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const ended = useRef(false);
  const [view, setView] = useState<View | null>(null);
  const [done, setDone] = useState(false);

  const later = (ms: number, then: () => void) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      then();
    }, ms);
    timers.current.add(timer);
  };

  const end = (how: "done" | "skip" | "close", run: Run, stop = current(run)) => {
    if (ended.current) return;
    ended.current = true;
    generation.current++;
    const at = stop ? position(run) : { position: run.stops.length, of: run.stops.length };
    track("tour_ended", { how, stop: stop?.id ?? "", ...at });
    dismiss(tour.id).catch(() => {
      // Ended for this page session anyway; the Tour may come back on a later visit.
    });
    dialog.current?.close();
    setDone(true);
  };

  /**
   * Finds the Stop to show from `start` on: drops a tap Stop for the tab the
   * member is on, and any Stop whose target isn't there — after a tab move
   * waiting up to 3s for it, otherwise looking once. Nothing left ends the
   * Tour as done. `moved` opens the hole from shut on the new target.
   */
  const settle = async (start: Run, moved: boolean) => {
    const turn = ++generation.current;
    let run = start;
    let wait = moved;
    let last: Stop | undefined;
    // Not a `for (let stop = current(run); …)`: in the dev bundle, its update
    // clause lost the `current` import after an `await` and threw.
    while (true) {
      const stop = current(run);
      if (!stop) break;
      last = stop;
      const href = tabHref(stop.target);
      if (stop.kind === "tap" && href && onTab(window.location.pathname, href)) {
        run = drop(run);
        continue;
      }
      const element = wait ? await waitForTarget(stop.target, TARGET_WAIT_MS) : findTarget(stop.target);
      if (turn !== generation.current) return;
      if (!element) {
        run = drop(run);
        wait = false;
        continue;
      }
      target.current = element;
      const hole = measure(element, stop);
      if (!moved) {
        setView({ run, hole, shut: false, jump: false });
        return;
      }
      // Jump the shut hole to the new target unseen, then open it.
      setView({ run, hole, shut: true, jump: true });
      later(40, () => setView((view) => view && { ...view, shut: false, jump: false }));
      return;
    }
    end("done", run, last);
  };

  /** Abandons whatever `settle` is waiting on, and every timer. */
  const cancel = () => {
    generation.current++;
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  };

  useEffect(() => {
    // A tick after mount, so the page under it has committed. An open sheet
    // means the member is busy; the Tour waits for a later landing.
    later(0, () => {
      if (!sheetOpen()) void settle(startRun(tour), false);
    });
    return cancel;
    // Starts once per mount; the Tour doesn't restart when its props change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showing = view !== null && !done;
  const stop = view ? current(view.run) : undefined;

  useEffect(() => {
    if (!showing) return;
    if (!dialog.current?.open) dialog.current?.showModal();
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    const remeasure = () => {
      setView((view) => {
        const stop = view && current(view.run);
        return view && stop && target.current ? { ...view, hole: measure(target.current, stop) } : view;
      });
    };
    window.addEventListener("resize", remeasure);
    return () => {
      html.style.overflow = before;
      window.removeEventListener("resize", remeasure);
    };
  }, [showing]);

  // Focus follows the Stop: the way on, which on a tap Stop is the target.
  const focusKey = view && !view.shut ? stop?.id : undefined;
  useEffect(() => {
    if (!focusKey) return;
    const way = stop?.kind === "tap" ? holeButton.current : nextButton.current;
    way?.focus({ preventScroll: true });
  }, [focusKey, stop?.kind]);

  if (!showing || !stop) return null;
  const { run, hole, shut, jump } = view;
  const can = controls(run);
  const { position: at, of } = position(run);

  const goNext = () => {
    if (can.last) end("done", run);
    else void settle(next(run), false);
  };

  const tapTarget = () => {
    if (stop.kind !== "tap") return goNext();
    const href = target.current?.getAttribute("href") ?? tabHref(stop.target);
    if (!href) return;
    setView({ ...view, shut: true });
    later(reducedMotion() ? 0 : SHUT_MS, () => {
      router.push(href);
      void settle(next(run), true);
    });
  };

  const nudge = (event: MouseEvent<HTMLDialogElement>) => {
    if (card.current?.contains(event.target as Node) || event.target === holeButton.current) return;
    if (reducedMotion()) return;
    card.current?.animate?.(
      [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }],
      { duration: 300, easing: "ease-in-out" },
    );
  };

  // A shut hole is a zero-size box at its target's centre: the dim stays
  // whole while the tab changes underneath.
  const box = shut
    ? { left: hole.x + hole.w / 2, top: hole.y + hole.h / 2, width: 0, height: 0 }
    : { left: hole.x, top: hole.y, width: hole.w, height: hole.h };
  const motion = jump ? "transition-none" : "";

  return (
    <dialog
      ref={dialog}
      aria-labelledby="tour-stop-title"
      aria-describedby="tour-stop-body"
      onCancel={(event) => {
        event.preventDefault();
        end("close", run);
      }}
      onClick={nudge}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden border-0 bg-transparent p-0 backdrop:bg-transparent"
    >
      <div
        ref={card}
        style={cardPlace(hole)}
        className={`absolute z-10 right-[max(16px,env(safe-area-inset-right))] left-[max(16px,env(safe-area-inset-left))] rounded-[14px] border border-border bg-card text-card-foreground shadow-[0_8px_24px_rgb(0_0_0/0.25)] [transition:opacity_160ms_ease,top_260ms_ease,bottom_260ms_ease] motion-reduce:[transition:none] ${shut ? "pointer-events-none opacity-0" : "opacity-100"} ${motion}`}
      >
        <div className="flex items-center justify-between pt-1 pr-1 pl-4">
          <p className={SECTION_LABEL}>
            {at} of {of}
          </p>
          <button
            type="button"
            onClick={() => end("skip", run)}
            className="h-tap rounded-md px-3 text-sm font-bold text-muted-foreground hover:bg-accent"
          >
            Skip
          </button>
        </div>
        <div className="grid gap-1 px-4 pb-4">
          <h2 id="tour-stop-title" className="text-[19px] leading-6 font-black">
            {stop.title}
          </h2>
          <p id="tour-stop-body" className="text-[15px] leading-[22px]">
            {stop.body}
          </p>
        </div>
        {(can.back || can.next) && (
          <div className="flex gap-2 px-4 pb-4">
            {can.back && (
              <Button variant="outline" className="h-tap px-[18px] text-[15px] font-bold" onClick={() => void settle(back(run), false)}>
                Back
              </Button>
            )}
            {can.next && (
              <Button ref={nextButton} className="h-tap flex-1 text-[15px] font-bold" onClick={goNext}>
                {can.last ? "Done" : "Next"}
              </Button>
            )}
          </div>
        )}
      </div>
      <button
        ref={holeButton}
        type="button"
        onClick={tapTarget}
        aria-label={stop.kind === "tap" ? `Go to ${stop.title}` : undefined}
        aria-hidden={stop.kind === "tap" ? undefined : true}
        tabIndex={stop.kind === "tap" ? undefined : -1}
        style={{
          ...box,
          borderRadius: hole.round ? 9999 : 12,
          boxShadow: "0 0 0 3px var(--secondary), 0 0 0 200vmax color-mix(in srgb, var(--foreground) 60%, transparent)",
        }}
        // The dim is this button's shadow, so the card sits above it (z-10).
        className={`absolute min-h-0 cursor-pointer bg-transparent outline-none [transition:left_260ms_ease,top_260ms_ease,width_260ms_ease,height_260ms_ease,border-radius_260ms_ease] motion-reduce:[transition:none] ${motion}`}
      />
    </dialog>
  );
}
