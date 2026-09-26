/**
 * Whether this browser has seen a What's new entry. It lives in
 * `localStorage`, not on the member, so a new device shows the entry once
 * more: the modal is a stopgap until the tutorial, and not worth a column.
 *
 * Storage can be missing or throw (a private window, blocked site data), and
 * then the entry counts as seen: a modal that reappears on every visit is
 * worse than one that never shows.
 */
export const WHATS_NEW_KEY = "whats-new-seen";

/** The event the Profile menu's What's new row fires to reopen the modal. */
export const WHATS_NEW_OPEN = "whats-new:open";

export function hasSeen(storage: () => Pick<Storage, "getItem">, entryId: string): boolean {
  try {
    return storage().getItem(WHATS_NEW_KEY) === entryId;
  } catch {
    return true;
  }
}

export function markSeen(storage: () => Pick<Storage, "setItem">, entryId: string): void {
  try {
    storage().setItem(WHATS_NEW_KEY, entryId);
  } catch {
    // Nowhere to remember it; the modal simply shows again next time.
  }
}
