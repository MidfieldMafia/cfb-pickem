/**
 * The Week a member is standing in: the published Slate, their own pick
 * sheet, and — once the Deadline has passed — the Reveal. Vocabulary follows
 * CONTEXT.md.
 *
 * Every screen used to compose this by hand: `publishedSlate`, then
 * `pickSheet`, then the score refresh, then the grading, each re-deriving the
 * same Week over its own round trip and each absorbing a different answer to
 * "there is no Week". The composition lives here instead. The Week is loaded
 * once and handed to everything that needs it, and no published Week is one
 * shape — a null `WeekContext` — rather than a null on one path and a throw
 * on another.
 */
import "server-only";
import type { Member } from "@/db/schema";
import type { Db } from "@/db/types";
import type { CfbdClient } from "@/lib/cfbd/types";
import { pickSheet, type PickSheet } from "@/lib/picks/picks";
import { picksComplete } from "@/lib/picks/progress";
import { playedWeeks, weekResult, type GradedWeekResult } from "@/lib/results/results";
import { refreshResultsIfStale } from "@/lib/results/writes";
import { activeSeason, deadlinePassed, publishedSlate, slateFor, type Slate } from "@/lib/slate/slate";

interface WeekBase {
  slate: Slate;
  sheet: PickSheet;
}

/** Before the Deadline: Picks are still open, and there is no Reveal to grade. */
export interface OpenWeek extends WeekBase {
  state: "open";
}

/**
 * Past the Deadline, and nobody asked for the grading — it costs a read per
 * member. Whether the Week is still live or settled is exactly what this
 * state does not know, so `landingRoute` does not take it: ask with
 * `{ graded: true }` and the type in hand is one that can be routed.
 */
export interface LockedWeek extends WeekBase {
  state: "locked";
}

/**
 * Past the Deadline for a member in no group. There is no board to grade, so
 * there is nothing to tell live from settled either; the member lands on the
 * "not in a group yet" screen rather than on an empty Leaderboard.
 */
export interface UngroupedWeek extends WeekBase {
  state: "ungrouped";
}

interface GradedBase extends WeekBase {
  /** The Week graded: the Reveal board, everyone's Weekly Score, and the Weekly Win. */
  result: GradedWeekResult;
}

/** Past the Deadline, graded, and a game still to finish. */
export interface LiveWeek extends GradedBase {
  state: "live";
}

/** Past the Deadline, graded, and every non-void game final. */
export interface SettledWeek extends GradedBase {
  state: "settled";
}

/**
 * The published Week for one member at one instant, as the state it is in
 * rather than a bag of nullable fields. "There is no published Week" is the
 * one shape outside it: `currentWeek` answers null.
 */
export type WeekContext = OpenWeek | LockedWeek | UngroupedWeek | LiveWeek | SettledWeek;

/** What `currentWeek(..., { graded: true })` can answer: every state but the one that skipped the grading. */
export type GradedWeekContext = Exclude<WeekContext, LockedWeek>;

export interface WeekOptions {
  /**
   * The group whose board to grade against, and the reason `graded` below is
   * not enough on its own: a Weekly Score, a place and a Weekly Win only mean
   * anything inside a group, so there is no such thing as grading this Week in
   * general.
   *
   * Null — or absent — for a member who is in no group. There is no board to
   * grade, so there is no `result` however `graded` is set, and the member lands on the "not in a group yet" screen rather than on an
   * empty Leaderboard. Pick entry passes no group at all, deliberately: a
   * Pick is one person's and counts in every group they play in.
   */
  group?: number | null;
  /**
   * Grade the Week too, once the Deadline has passed: the board and the
   * scores arrive together from one pass, so asking for either is this flag.
   */
  graded?: boolean;
  /**
   * Keep the scores fresh: member traffic schedules the feed, and a visit
   * after the Deadline pulls CollegeFootballData when a game is past kickoff
   * without a final, bounded by the stale gate. A factory rather than a
   * client, because building the production one reads the environment and
   * throws without a key — a failure the page has to survive like any other.
   */
  cfbd?: () => CfbdClient;
}

/** A feed failure never breaks the page; the last scores stand and the Slate we hold is the one we read on from. */
async function refreshQuietly(db: Db, cfbd: () => CfbdClient, slate: Slate, now: Date): Promise<Slate> {
  try {
    return (await refreshResultsIfStale(db, cfbd(), slate, now)).slate;
  } catch (error) {
    console.warn("Results refresh skipped:", error instanceof Error ? error.message : error);
    return slate;
  }
}

/**
 * The published Slate with its scores as fresh as the stale gate allows, for a
 * screen that reads the season rather than one member's Week: the Leaderboard
 * pulls the feed here first, so the standings it grades next see the same rows.
 * Null when no Week is published.
 */
export async function freshSlate(db: Db, cfbd: () => CfbdClient, now: Date = new Date()): Promise<Slate | null> {
  const published = await publishedSlate(db);
  if (!published) return null;
  return deadlinePassed(published.week, now) ? refreshQuietly(db, cfbd, published, now) : published;
}

/**
 * The Week this member is in right now, or null when no Week in the active
 * season has been published. The Slate arrives published by construction, so
 * the "not published" throws inside `pickSheet` and `weekPicks` are
 * unreachable from here: null is the only way "there is no Week" comes back.
 *
 * Asking for `graded` narrows the answer to `GradedWeekContext`, which has no
 * `locked` state: past the Deadline it is `live`, `settled`, or `ungrouped`.
 */
export async function currentWeek(
  db: Db,
  actor: Member,
  now: Date | undefined,
  options: WeekOptions & { graded: true },
): Promise<GradedWeekContext | null>;
export async function currentWeek(
  db: Db,
  actor: Member,
  now?: Date,
  options?: WeekOptions,
): Promise<WeekContext | null>;
export async function currentWeek(
  db: Db,
  actor: Member,
  now: Date = new Date(),
  options: WeekOptions = {},
): Promise<WeekContext | null> {
  const published = await publishedSlate(db);
  if (!published) return null;
  const locked = deadlinePassed(published.week, now);
  // Any feed pull happens before the reads, so the sheet and the Reveal see the same rows.
  const slate = locked && options.cfbd ? await refreshQuietly(db, options.cfbd, published, now) : published;
  // No group is no board: a grading with nobody to be graded against is the
  // `ungrouped` state, rather than the read inventing a site-wide board that no
  // longer exists.
  const group = options.group ?? null;
  const grading = locked && options.graded && group !== null;
  const [sheet, result] = await Promise.all([
    pickSheet(db, actor, slate, now),
    grading ? weekResult(db, group, slate, now) : null,
  ]);
  const base = { slate, sheet };
  if (!locked) return { ...base, state: "open" };
  if (!options.graded) return { ...base, state: "locked" };
  if (!result) return { ...base, state: "ungrouped" };
  return { ...base, state: result.complete ? "settled" : "live", result };
}

/**
 * Where a member lands, in the order the states resolve. No published Week is
 * Leaderboard; past the Deadline and still grading is the Live Board; past it
 * with every game final is the Leaderboard.
 *
 * Short of the Deadline is #91's Picks split in two. Entry while Picks are
 * still open, review once they are all in: the entry flow has no control for
 * the Lock of the Week or the Tiebreaker Guess, so a member who has finished
 * picking is sent to the screen that does rather than back to the top of a
 * slate they have already decided.
 *
 * Takes a `GradedWeekContext`, so a Week read without `{ graded: true }` is a
 * type error rather than a settled Week quietly sent to the Live Board. A
 * member in no group lands on the Live Board too, which is where the "not in a
 * group yet" screen lives.
 */
export function landingRoute(
  week: GradedWeekContext | null,
): "/leaderboard" | "/picks" | "/picks/review" | "/live" {
  if (!week) return "/leaderboard";
  switch (week.state) {
    case "open":
      return picksComplete(week.sheet.progress) ? "/picks/review" : "/picks";
    case "settled":
      return "/leaderboard";
    case "live":
    case "ungrouped":
      return "/live";
  }
}

/** A Week the season has finished with, graded, with the Weeks a member may look at instead. */
export interface WeekReview {
  slate: Slate;
  /**
   * Always graded, unlike `WeekContext.result`: a Week is only reviewable once
   * its Deadline has passed, so there is no state of this screen where the
   * scores and the Reveal are missing and every section has to guard for it.
   */
  result: GradedWeekResult;
  /** Every Week whose Deadline has passed, in week order: what the chooser offers. */
  played: number[];
}

/**
 * The Week a member is looking back at — the counterpart to `currentWeek`,
 * which composes the Week they are standing in.
 *
 * `weekNumber` is the one they asked for; a number the season has not played
 * yet (a nonsense `?week=`, or a Week still open) falls back to the latest it
 * has, so the screen opens on the most recent results rather than on an
 * error. Null when the season has played no Week at all, which is the one
 * "there is nothing here yet" this screen has — the same shape `currentWeek`
 * uses for it.
 *
 * The member's own Picks are not read separately: the Reveal carries every
 * member's Pick per Game from the same grading pass, so
 * `summary.pickBreakdown` transposes theirs out of it rather than this
 * loading a second, ungraded copy that could disagree with the board.
 */
export async function weekInReview(
  db: Db,
  weekNumber: number | undefined,
  now: Date = new Date(),
  options: Pick<WeekOptions, "cfbd" | "group"> = {},
): Promise<WeekReview | null> {
  // A member in no group has no week to look back at, which is the same "there
  // is nothing here yet" this screen already had a shape for.
  const group = options.group ?? null;
  if (group === null) return null;
  const season = await activeSeason(db);
  const played = await playedWeeks(db, season, now);
  const chosen = played.find((w) => w.weekNumber === weekNumber) ?? played[played.length - 1];
  if (!chosen) return null;
  const loaded = await slateFor(db, chosen.id);
  // A member landing here straight after a game ends drives the feed too, on
  // the same stale gate `/week` uses; grading then reads the rows it left.
  const slate = options.cfbd ? await refreshQuietly(db, options.cfbd, loaded, now) : loaded;
  return {
    slate,
    result: await weekResult(db, group, slate, now),
    played: played.map((w) => w.weekNumber),
  };
}
