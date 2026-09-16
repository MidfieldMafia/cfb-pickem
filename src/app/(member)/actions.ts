"use server";

import { cookies } from "next/headers";
import { db } from "@/db";
import { CURRENT_GROUP_COOKIE, currentGroupCookieOptions, groupChoice } from "@/lib/groups/current";
import { requireMember } from "@/lib/members/current";

/**
 * Remembers the group a member tapped, per device.
 *
 * The posted id is re-checked against their own memberships rather than
 * trusted. A Server Action is a POST endpoint against the page that defined it,
 * reachable by anyone who can send the request, so the fact that only their own
 * groups are ever rendered into the form is not the check — this is.
 *
 * A group that is not theirs is ignored rather than refused: the only way to
 * reach that branch honestly is a switcher rendered before a membership ended,
 * and a stale tap should land them on a board they can see, not on an error.
 * `currentGroupChoice` falls back on the next read either way.
 *
 * Nothing is revalidated by hand. Mutating a cookie inside a Server Action
 * makes Next re-render the current route in the same response, so the board
 * underneath swaps without a second round trip.
 */
export async function switchGroup(formData: FormData): Promise<void> {
  const member = await requireMember();
  const wanted = Number(formData.get("groupId"));
  const choice = await groupChoice(db(), member.id, undefined);
  if (!choice?.groups.some((group) => group.id === wanted)) return;
  const store = await cookies();
  store.set(CURRENT_GROUP_COOKIE, String(wanted), currentGroupCookieOptions());
}
