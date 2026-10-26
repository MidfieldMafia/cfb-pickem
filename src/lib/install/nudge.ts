/**
 * The Home Screen nudge on Picks (#455): a bottom sheet the first time, then a
 * banner at the top of Picks on every later visit, until the app is on the
 * Home Screen. Who gets it at all (Safari on iPhone, not installed, picks
 * open) is the caller's to decide; this module only decides which, from what
 * this browser remembers.
 *
 * Everything lives in `localStorage`, nothing on the server. Storage can be
 * missing or throw (a private window, blocked site data), and then nothing
 * shows: a sheet that opens on every visit is worse than no nudge.
 */

export const NUDGE_KEY = "home-screen-nudge";

/**
 * A visit is the app opened fresh after this long away. A reload, or a quick
 * switch to another app and back, inside it is the same visit.
 */
export const VISIT_GAP_MS = 30 * 60 * 1000;

/** The banner's X hides it until tomorrow; this many taps hide it for good (#481). */
const BANNER_HIDES_FOR_GOOD = 3;

export type Nudge = "sheet" | "banner" | null;

/** `localStorage`, behind a call: reaching it can throw as well as reading it. */
type Store = () => Pick<Storage, "getItem" | "setItem">;

/** What this browser remembers. Each visit is named by the time it started. */
interface Remembered {
  /** The last time Picks was open: on opening it, and while it stays open. */
  lastSeen?: number;
  /** When the current visit started. */
  visit?: number;
  /** The visit whose sheet was closed or acted on. Set once, never cleared. */
  sheetClosed?: number;
  /** A visit whose sheet waited because another pop-up was showing. */
  sheetWaited?: number;
  /** The X on the banner: the local date it was tapped, and the visit. */
  bannerHidden?: { day: string; visit: number };
  /** How many times the banner's X has been tapped, ever. */
  bannerHides?: number;
  /** The onboarding step (#482) was shown and left. Set once, never cleared. */
  stepShown?: boolean;
}

function read(storage: Store, key: string): Remembered {
  const raw = storage().getItem(key);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Remembered) : {};
  } catch {
    return {};
  }
}

/** Reads, changes and writes back, swallowing a storage that throws. */
function update(storage: Store, key: string, change: (memory: Remembered) => void): void {
  try {
    const memory = read(storage, key);
    change(memory);
    storage().setItem(key, JSON.stringify(memory));
  } catch {
    // Nowhere to remember it.
  }
}

/** The member's own calendar date, so the banner's X lasts until their midnight. */
function localDay(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

/**
 * Picks has just opened: starts a visit when the last one has lapsed, and says
 * what to show. The sheet waits for a visit with no other pop-up open (the
 * Welcome Tour, What's new), and once closed never shows again; the banner
 * then shows on every later visit, unless its X hid it today or this visit,
 * or has been tapped three times.
 */
export function openPicks(
  storage: Store,
  now: Date,
  { popupShowing }: { popupShowing: boolean },
  key: string = NUDGE_KEY,
): Nudge {
  let shown: Nudge = null;
  try {
    const memory = read(storage, key);
    const at = now.getTime();
    const visit =
      memory.visit !== undefined && memory.lastSeen !== undefined && at - memory.lastSeen <= VISIT_GAP_MS
        ? memory.visit
        : at;
    memory.visit = visit;
    memory.lastSeen = at;

    if (memory.sheetClosed === undefined) {
      if (memory.sheetWaited === visit) shown = null;
      else if (popupShowing) memory.sheetWaited = visit;
      else shown = "sheet";
    } else if (memory.sheetClosed === visit) {
      shown = null;
    } else {
      const hidden = memory.bannerHidden;
      const forGood = (memory.bannerHides ?? 0) >= BANNER_HIDES_FOR_GOOD;
      shown = forGood || (hidden && (hidden.day === localDay(now) || hidden.visit === visit)) ? null : "banner";
    }

    storage().setItem(key, JSON.stringify(memory));
  } catch {
    return null;
  }
  return shown;
}

/** Picks is still open: keeps the visit from lapsing while the member is on it. */
export function stillHere(storage: Store, now: Date, key: string = NUDGE_KEY): void {
  update(storage, key, (memory) => {
    memory.lastSeen = now.getTime();
  });
}

/** The sheet closed, any way, or its Add was tapped: it never opens again. */
export function closeSheet(storage: Store, key: string = NUDGE_KEY): void {
  update(storage, key, (memory) => {
    memory.sheetClosed ??= memory.visit ?? 0;
  });
}

/**
 * The banner's X: hidden for the rest of the member's day, and of this visit;
 * the third tap hides it for good.
 */
export function hideBanner(storage: Store, now: Date, key: string = NUDGE_KEY): void {
  update(storage, key, (memory) => {
    memory.bannerHidden = { day: localDay(now), visit: memory.visit ?? now.getTime() };
    memory.bannerHides = (memory.bannerHides ?? 0) + 1;
  });
}

/**
 * Whether the onboarding step (#482) has been shown on this device. Storage
 * that cannot be read counts as shown: a full page that returns on every open
 * is worse than none.
 */
export function stepWasShown(storage: Store, key: string = NUDGE_KEY): boolean {
  try {
    return read(storage, key).stepShown === true;
  } catch {
    return true;
  }
}

/** The onboarding step was left: it never shows again, and neither does the first-open sheet. */
export function markStepShown(storage: Store, key: string = NUDGE_KEY): void {
  update(storage, key, (memory) => {
    memory.stepShown = true;
    memory.sheetClosed ??= memory.visit ?? 0;
  });
}
