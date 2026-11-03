/**
 * `/go?group=<id>&to=<path>` (#493, #529): the link a push opens when the
 * screen it points at belongs to one group. The group is only a per-device
 * cookie (`slate_group`), so the link switches it first, then opens the screen.
 * Chat, @mention and Weekly Win pushes use it.
 *
 * Neither half is trusted. The group is switched to only while it is one of
 * the member's own, as `switchGroup` checks it; otherwise the cookie is left
 * alone and the screen falls back the way it always does. The path must stay
 * in this app, so the link cannot be used to send anyone elsewhere.
 */
import "server-only";
import type { Db } from "@/db/types";
import { memberGroups } from "./memberships";

/** Any origin will do: the path is resolved against it only to see whether it stays there. */
const HERE = "https://slate.invalid";

/** `to` as a path in this app, with its query and hash; the home screen for anything else. */
export function sameOriginPath(to: unknown): string {
  if (typeof to !== "string" || !to.startsWith("/") || to.startsWith("//") || to.startsWith("/\\")) return "/";
  try {
    const url = new URL(to, HERE);
    return url.origin === HERE ? url.pathname + url.search + url.hash : "/";
  } catch {
    return "/";
  }
}

export interface GoTarget {
  /** The group to remember on this device, or null to leave the cookie as it is. */
  group: number | null;
  path: string;
}

/** Where a `/go` link lands the member signed in now (`memberId`, null when nobody is). */
export async function goTarget(db: Db, memberId: number | null, group: string | null, to: string | null): Promise<GoTarget> {
  const path = sameOriginPath(to);
  if (memberId === null || !group) return { group: null, path };
  const wanted = Number(group);
  const theirs = (await memberGroups(db, memberId)).some((entry) => entry.group.id === wanted);
  return { group: theirs ? wanted : null, path };
}
