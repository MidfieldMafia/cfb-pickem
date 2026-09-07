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
import { playedWeeks, refreshResultsIfStale, weekResult, type GradedWeekResult } from "@/lib/results/results";
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
}

export interface WeekOptions {
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
  const [sheet, result] = await Promise.all([
    pickSheet(db, actor, slate, now),
    locked && options.graded ? weekResult(db, actor, slate, now) : null,
  ]);
  return { slate, sheet, result };
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
  actor: Member,
  weekNumber: number | undefined,
  now: Date = new Date(),
  options: Pick<WeekOptions, "cfbd"> = {},
): Promise<WeekReview | null> {
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
    result: await weekResult(db, actor, slate, now),
    played: played.map((w) => w.weekNumber),
  };
}
