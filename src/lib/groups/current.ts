/**
 * Which group a member is looking at, which ones they could switch to, and how
 * a device remembers the choice.
 *
 * The cookie is a *preference*, never an authority. It lives for a year on a
 * phone, and a membership can end inside that year — removed by an organizer,
 * or left voluntarily — so every read checks it against the memberships that
 * actually stand and falls back rather than trusting it. A member cannot reach
 * another group's board by editing it either, for the same reason: the answer
 * is always one of the groups `memberGroups` hands back.
 */
import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "@/db";
import type { Group } from "@/db/schema";
import type { Db } from "@/db/types";
import { currentMember } from "@/lib/members/current";
import { memberGroups } from "./memberships";

/** The device's remembered group. Distinct from `slate_session`, which is who they are. */
export const CURRENT_GROUP_COOKIE = "slate_group";

/** A year, matching the session cookie: a phone should not forget between Saturdays. */
const GROUP_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function currentGroupCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GROUP_MAX_AGE_SECONDS,
  };
}

/** The groups a member can move between, and the one they are looking at. */
export interface GroupChoice {
  /** The board on screen. Always one of `groups`. */
  current: Group;
  /**
   * Every group they are in now, oldest membership first. One entry means the
   * header is a name and not a control: there is nowhere to switch to.
   */
  groups: Group[];
}

/**
 * What the header offers: the board on screen, and everything the member could
 * switch to. The remembered value is honoured only while it names a group that
 * is still theirs; otherwise the oldest membership wins.
 *
 * Null when they are in no group at all — the "not in a group yet" screen.
 *
 * Takes the remembered value rather than reading the cookie itself, the way
 * `PickRoute` takes `currentMember`: the rule is then a function of rows and a
 * string, and a test can drive every branch of it without Next's request scope.
 */
export async function groupChoice(
  db: Db,
  memberId: number,
  remembered: string | undefined,
): Promise<GroupChoice | null> {
  // `memberGroups` is already in joined order and already leaves out a group the
  // member has been removed from and not restored to.
  const entries = await memberGroups(db, memberId);
  const [first] = entries;
  if (!first) return null;
  // Parsed, not trusted: a hand-edited cookie naming someone else's group finds
  // no match here and falls through to a board that is genuinely theirs.
  const wanted = Number(remembered);
  const still = entries.find((entry) => entry.group.id === wanted);
  return { current: (still ?? first).group, groups: entries.map((entry) => entry.group) };
}

/**
 * Just the id, for the reads that only need to know which board to compute.
 * Delegates rather than repeating the fallback, so there is one statement of
 * which group is current and not two that could drift.
 */
export async function currentGroupId(
  db: Db,
  memberId: number,
  remembered: string | undefined,
): Promise<number | null> {
  return (await groupChoice(db, memberId, remembered))?.current.id ?? null;
}

/**
 * The same answer for a screen, from the request's own cookies. Cached per
 * request because the page and the header both ask — and because the header
 * needs the whole choice while the page needs only the id, this is the one read
 * they share.
 */
export const currentGroupChoice = cache(async (): Promise<GroupChoice | null> => {
  const member = await currentMember();
  if (!member) return null;
  const store = await cookies();
  return groupChoice(db(), member.id, store.get(CURRENT_GROUP_COOKIE)?.value);
});

/** The current group's id for a screen, or null for a member in no group. */
export const currentGroup = cache(async (): Promise<number | null> => {
  return (await currentGroupChoice())?.current.id ?? null;
});
