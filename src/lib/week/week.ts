/**
 * The Week a member is standing in: the published Slate, their own pick
 * sheet, and — once the Deadline has passed — the Reveal. Vocabulary follows
 * CONTEXT.md.
 *
 * Every screen used to compose this by hand: `publishedSlate`, then
 * `pickSheet`, then the score refresh, then `revealFor`, each re-deriving the
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
import { refreshResultsIfStale, revealFor, type Reveal } from "@/lib/results/results";
import { deadlinePassed, publishedSlate, type Slate } from "@/lib/slate/slate";

/** The published Week for one member at one instant. */
export interface WeekContext {
  slate: Slate;
  sheet: PickSheet;
  /** True once the server clock has reached the Deadline: picks are closed and the Reveal is open. */
  locked: boolean;
  /**
   * Everyone's picks, graded. Null before the Deadline, and null after it for
   * the screens that did not ask for it — building it costs a read per member.
   */
  reveal: Reveal | null;
}

export interface WeekOptions {
  /** Load the Reveal too, once the Deadline has passed. Only the week screen shows it. */
  reveal?: boolean;
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
  const locked = deadlinePassed(published, now);
  // Any feed pull happens before the reads, so the sheet and the Reveal see the same rows.
  const slate = locked && options.cfbd ? await refreshQuietly(db, options.cfbd, published, now) : published;
  const [sheet, reveal] = await Promise.all([
    pickSheet(db, actor, slate, now),
    locked && options.reveal ? revealFor(db, actor, slate, now) : null,
  ]);
  return { slate, sheet, locked, reveal };
}
