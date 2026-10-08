/**
 * The Week a member is standing in: the published Slate, their own pick
 * sheet, and — once the Deadline has passed — the Reveal. Vocabulary follows
 * GLOSSARY.md.
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
import { effectiveResult, settled } from "@/lib/results/result";
import { groupPlayedWeeks, weekResult, type GradedWeekResult } from "@/lib/results/results";
import { refreshStatsIfStale } from "@/lib/results/box-scores";
import { refreshResultsIfStale } from "@/lib/results/writes";
import { activeSeason, deadlinePassed, publishedSlate, slateFor, type Slate } from "@/lib/slate/slate";

/**
 * Where the Week stands, read off the Slate and the clock alone: Picks still
 * open before the Deadline; `live` past it while a Game is still to finish;
 * `settled` once every Game is final or Void. No grading decides it, so no
 * group has to be named to ask.
 */
export type WeekState = "open" | "live" | "settled";

/**
 * The published Week for one member at one instant. "There is no published
 * Week" is the one shape outside it: `currentWeek` answers null.
 */
export interface WeekContext {
  state: WeekState;
  slate: Slate;
  sheet: PickSheet;
}

/**
 * The Week graded on one group's board, for the screens that show scores: the
 * Reveal board, everyone's Weekly Score, and the Weekly Win, from one pass.
 * Null before the Deadline, which is what gates the Reveal, and for a member in
 * no group, who has no board to be graded on.
 */
export interface ScoredWeek extends WeekContext {
  result: GradedWeekResult | null;
}

export interface WeekOptions {
  /**
   * Keep the scores fresh: member traffic schedules the feed, and a visit
   * after the Deadline pulls CollegeFootballData when a game is past kickoff
   * without a final, bounded by the stale gate. A factory rather than a
   * client, because building the production one reads the environment and
   * throws without a key — a failure the page has to survive like any other.
   */
  cfbd?: () => CfbdClient;
}

/**
 * A feed failure never breaks the page; the last scores stand and the Slate we
 * hold is the one we read on from. The box scores come after the scores, on a
 * gate of their own and a catch of their own, so a stats call that fails or
 * times out never costs the scores or the live plays.
 */
async function refreshQuietly(db: Db, cfbd: () => CfbdClient, slate: Slate, now: Date): Promise<Slate> {
  let fresh = slate;
  try {
    fresh = (await refreshResultsIfStale(db, cfbd(), slate, now)).slate;
  } catch (error) {
    console.warn("Results refresh skipped:", error instanceof Error ? error.message : error);
  }
  try {
    await refreshStatsIfStale(db, cfbd(), fresh, now);
  } catch (error) {
    console.warn("Box scores skipped:", error instanceof Error ? error.message : error);
  }
  return fresh;
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

/** The published Slate, through the feed first when the caller drives it. Null when no Week is published. */
function loadSlate(db: Db, now: Date, options: WeekOptions): Promise<Slate | null> {
  return options.cfbd ? freshSlate(db, options.cfbd, now) : publishedSlate(db);
}

function stateOf(slate: Slate, now: Date): WeekState {
  if (!deadlinePassed(slate.week, now)) return "open";
  return slate.games.every((game) => settled(effectiveResult(game, now))) ? "settled" : "live";
}

/**
 * The Week this member is in right now, or null when no Week in the active
 * season has been published. The Slate arrives published by construction, so
 * the "not published" throw inside `weekEntries` is unreachable from here: null
 * is the only way "there is no Week" comes back.
 *
 * Nothing here grades. Whether the Week is live or settled comes from its
 * Games, so a redirect or a pick page pays for one member's sheet, not a whole
 * group's board; `scoredWeek` is for the screens that show the scores.
 */
export async function currentWeek(
  db: Db,
  actor: Member,
  now: Date = new Date(),
  options: WeekOptions = {},
): Promise<WeekContext | null> {
  const slate = await loadSlate(db, now, options);
  if (!slate) return null;
  return { state: stateOf(slate, now), slate, sheet: await pickSheet(db, actor, slate, now) };
}

/**
 * `currentWeek`, graded on `group`'s board once the Deadline has passed. The
 * sheet and the grading read the same Slate, after any feed pull, so the
 * member's own row and the Reveal cannot disagree; they run side by side, so
 * the poll waits for one round trip, not two.
 *
 * `group` is required, and null is an answer: a member in no group gets the
 * Week with no `result`, rather than a read inventing a board for them.
 */
export async function scoredWeek(
  db: Db,
  actor: Member,
  group: number | null,
  now: Date = new Date(),
  options: WeekOptions = {},
): Promise<ScoredWeek | null> {
  const slate = await loadSlate(db, now, options);
  if (!slate) return null;
  const state = stateOf(slate, now);
  const [sheet, result] = await Promise.all([
    pickSheet(db, actor, slate, now),
    state !== "open" && group !== null ? weekResult(db, group, slate, now) : null,
  ]);
  return { state, slate, sheet, result };
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
 * A member in no group lands where the Week's state sends anyone: both the
 * Live Board and the Leaderboard show them the "not in a group yet" screen.
 */
export function landingRoute(week: WeekContext | null): "/leaderboard" | "/picks" | "/picks/review" | "/live" {
  if (!week) return "/leaderboard";
  switch (week.state) {
    case "open":
      return picksComplete(week.sheet.progress) ? "/picks/review" : "/picks";
    case "settled":
      return "/leaderboard";
    case "live":
      return "/live";
  }
}

/** A Week the season has finished with, graded, with the Weeks a member may look at instead. */
export interface WeekReview {
  slate: Slate;
  /**
   * Always graded, unlike `ScoredWeek.result`: a Week is only reviewable once
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
  options: WeekOptions & { group?: number | null } = {},
): Promise<WeekReview | null> {
  // A member in no group has no week to look back at, which is the same "there
  // is nothing here yet" this screen already had a shape for.
  const group = options.group ?? null;
  if (group === null) return null;
  const season = await activeSeason(db);
  // The group's played Weeks, not the Season's: a Week nobody here picked has
  // nothing to reveal, so it is not offered and `?week=` for it lands on the latest (#332).
  const played = await groupPlayedWeeks(db, group, season, now);
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
