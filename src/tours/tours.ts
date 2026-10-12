import type { TourId } from "./ids";

/**
 * What a Stop can spotlight: the `data-tour` ids the app renders (#426,
 * "Registry and targets"). Tab buttons, the Pennant and the Rules icon render
 * in `packages/design-system`; the screen targets are each tab's content area,
 * between the header and the nav. `tours.test.ts` fails if one isn't written
 * anywhere.
 */
export type TourTarget =
  | "tab-picks"
  | "picks-screen"
  | "tab-live"
  | "live-screen"
  | "tab-leaderboard"
  | "leaderboard-screen"
  | "tab-chat"
  | "chat-screen"
  | "pennant"
  | "rules";

/**
 * One step of a Tour. `kind` decides the card's controls:
 * - `tap`: a tab button. No Next; tapping the tab is the only way on, and
 *   the Stop is dropped when the member is already on that tab.
 * - `screen`: a tab's content area. No Back, since Back never crosses tabs.
 * - `point`: anything else. Back and Next; tapping the target is Next.
 */
export type Stop = {
  id: string;
  target: TourTarget;
  title: string;
  body: string;
  kind: "tap" | "screen" | "point";
};

export type Tour = { id: TourId; stops: readonly Stop[] };

/** The copy limits, from #375 and enforced by `tours.test.ts`. */
export const TITLE_MAX = 24;
export const BODY_MAX = 90;

/**
 * The Welcome Tour (#372): each tab as a tap Stop then a screen Stop, then the
 * Pennant menu and How to play. The order is fixed. Name a target by its
 * on-screen label or glossary term, never by where it sits or how it looks.
 */
const welcome: Tour = {
  id: "welcome",
  stops: [
    { id: "tab-picks", target: "tab-picks", kind: "tap", title: "Picks", body: "Tap Picks. Each week's picks live here." },
    {
      id: "picks-screen",
      target: "picks-screen",
      kind: "screen",
      title: "Pick every game",
      body: "Pick a winner in every game, then your Lock and Tiebreaker Guess, before the Deadline.",
    },
    { id: "tab-live", target: "tab-live", kind: "tap", title: "Live Board", body: "Tap Live Board to follow the games." },
    {
      id: "live-screen",
      target: "live-screen",
      kind: "screen",
      title: "Follow the games",
      body: "Every game this week with its score, and everyone's picks once the Deadline passes.",
    },
    {
      id: "tab-leaderboard",
      target: "tab-leaderboard",
      kind: "tap",
      title: "Leaderboard",
      body: "Tap Leaderboard for your group's season.",
    },
    {
      id: "leaderboard-screen",
      target: "leaderboard-screen",
      kind: "screen",
      title: "Your group's season",
      body: "Total points decide the season. Tap a Week to see how it went.",
    },
    { id: "tab-chat", target: "tab-chat", kind: "tap", title: "Chat", body: "Tap Chat to talk with your group." },
    {
      id: "chat-screen",
      target: "chat-screen",
      kind: "screen",
      title: "Talk it over",
      body: "One thread for your group. Everyone in it reads what you post here.",
    },
    { id: "pennant", target: "pennant", kind: "point", title: "Your Pennant", body: "Tap it for You, your groups and What's new." },
    {
      id: "rules",
      target: "rules",
      kind: "point",
      title: "How to play",
      body: "The rules, any time: points, your Lock, the Tiebreaker Guess and the Deadline.",
    },
  ],
};

export const tours: Record<TourId, Tour> = { welcome };
