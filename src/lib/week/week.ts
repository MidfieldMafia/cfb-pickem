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
import {
  gradedSeason,
  playedWeeks,
  refreshResultsIfStale,
  weekResult,
  type GradedWeekResult,
} from "@/lib/results/results";
import { seasonStanding, type SeasonStanding } from "@/lib/results/summary";
import { activeSeason, deadlinePassed, publishedSlate, slateFor, type Slate } from "@/lib/slate/slate";

/** The published Week for one member at one instant. */
export interface WeekContext {
  slate: Slate;
  sheet: PickSheet;
  /**
   * The Week graded: the Reveal board, everyone's Weekly Score, and the
   * Weekly Win. Null before the Deadline, and null after it for the screens
   * that did not ask for it — grading costs a read per member.
   */
  result: GradedWeekResult | null;
  /**
   * Where the member stands in the season, this Week's provisional points
   * included. Null before the Deadline and for the screens that did not ask
   * for it — the season costs a grading pass over every played Week, not just
   * this one.
   */
  season: SeasonStanding | null;
}

export interface WeekOptions {
  /**
   * The group whose board to grade against, and the reason `graded` and
   * `season` below are not enough on their own: a Weekly Score, a place and a
   * Weekly Win only mean anything inside a group, so there is no such thing as
   * grading this Week in general.
   *
   * Null — or absent — for a member who is in no group. There is no board to
   * grade, so `result` and `season` come back null however the flags are set,
   * and the member lands on the "not in a group yet" screen rather than on an
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
   * Grade the season as well, for the Live Board's own card: the member's
   * place and total across every played Week. Separate from `graded` because
   * it is a pass over the whole season rather than this Week, and only the
   * Live Board wants it — the Leaderboard reads `seasonResult` directly.
   */
  season?: boolean;
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
 * The Week this member is in right now, or null when no Week in the active
 * season has been published. The Slate arrives published by construction, so
 * the "not published" throws inside `pickSheet` and `weekPicks` are
 * unreachable from here: null is the only way "there is no Week" comes back.
 */
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
  // No group is no board: the flags ask for a grading that has nobody to be
  // graded against, so both come back null rather than the read inventing a
  // site-wide board that no longer exists.
  const group = options.group ?? null;
  // Once locked, the season's played Weeks include this one, so asking for the
  // standing as well as the Week is one grading pass with the Week cut out of
  // it — not `weekResult` and `seasonResult` each grading it again.
  const grading = locked && group !== null && (options.graded || options.season);
  const [sheet, graded] = await Promise.all([
    pickSheet(db, actor, slate, now),
    !grading
      ? null
      : options.season
        ? gradedSeason(db, group, slate, now)
        : weekResult(db, group, slate, now).then((result) => ({ result, season: null })),
  ]);
  return {
    slate,
    sheet,
    result: options.graded && graded ? graded.result : null,
    season: options.season && graded?.season ? seasonStanding(graded.season.leaderboard, actor.id) : null,
  };
}

/**
 * Where a member lands, in the order the states resolve. No published Week is
 * Leaderboard; past the Deadline and still grading is the Live Board; past it
 * with every game final is History.
 *
 * Short of the Deadline is #91's Picks split in two. Entry while Picks are
 * still open, review once they are all in: the entry flow has no control for
 * the Lock of the Week or the Tiebreaker Guess, so a member who has finished
 * picking is sent to the screen that does rather than back to the top of a
 * slate they have already decided.
 *
 * `week` must have been asked to grade (`currentWeek(..., { graded: true })`)
 * for the last two states to tell apart — an ungraded `WeekContext` carries a
 * null `result` whether the Week is mid-Reveal or long settled, and this
 * would read both as still live.
 */
export function landingRoute(
  week: WeekContext | null,
): "/leaderboard" | "/picks" | "/picks/review" | "/live" | "/history" {
  if (!week) return "/leaderboard";
  if (!week.sheet.locked) return picksComplete(week.sheet.progress) ? "/picks/review" : "/picks";
  if (!week.result?.complete) return "/live";
  return "/history";
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
