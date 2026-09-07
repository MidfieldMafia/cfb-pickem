import type { SheetProgress } from "@/lib/picks/progress";

/** The one button under the week card: where it goes, and what it says. */
export interface CallToAction {
  href: string;
  label: string;
}

/**
 * The ladder from "nothing entered" to "in the books". It was five nested
 * ternaries inside the button, which is a decision a screen was making rather
 * than rendering — and the only place in the app that knew a member with every
 * Pick in but no Lock should be sent to review rather than back through the
 * flow.
 *
 * Every rung with picks still open goes to the flow; everything else goes to
 * review, because there is nothing left to walk one game at a time.
 */
export function callToAction(progress: SheetProgress, locked: boolean): CallToAction {
  const allPicked = progress.picksMade === progress.liveGames;
  if (locked) return { href: "/picks/review", label: "See your picks" };
  if (progress.remaining === 0) return { href: "/picks/review", label: "Review your picks" };
  // Every Pick in, but the Lock or the Guess is not: review is where those live.
  if (allPicked) return { href: "/picks/review", label: "Finish up" };
  return { href: "/picks", label: progress.picksMade ? "Continue picking" : "Make your picks" };
}
