/**
 * The Regular Season Champion's celebration sheet (#592): whether the
 * `(member)` layout opens it for a member, and the seen row its dismissal
 * writes. One row per member, group and season (`championSheetViews`), so it
 * shows once on any device, in the shape of `@/lib/tours/dismissals`.
 */
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { championSheetViews, weeks, type Member } from "@/db/schema";
import type { Db } from "@/db/types";
import { memberGroups } from "@/lib/groups/memberships";
import type { ScoredMember } from "@/lib/results/json";
import { seasonResult } from "@/lib/results/results";
import { REGULAR_SEASON_FINAL_WEEK } from "@/lib/scoring";
import { activeSeason, deadlinePassed } from "@/lib/slate/slate";

/** What the sheet shows: the title, from the same `seasonResult` pass the Leaderboard's card reads. */
export interface ChampionSheet {
  year: number;
  champions: ScoredMember[];
  points: number;
  /** Whether the member viewing is a champion: only theirs has Share your win. */
  viewerIsChampion: boolean;
}

/**
 * A group the member is not in, or no group id at all. A fault, not a
 * `Refusal`: the sheet only ever sends the group it was rendered for, so this
 * is a forged or stale POST.
 */
export class InvalidChampionSheet extends Error {}

/**
 * The sheet to open for `memberId` in `groupId`, or null when there is none to
 * show: no champion yet, or one the member has already seen. A member who saw
 * it as somebody else's and has since been crowned by a Result Override sees
 * it once more, as theirs; a champion who saw it and has since lost the title
 * never does.
 *
 * Until Week 13's Deadline has passed there cannot be a champion, so the
 * season is graded only from then: every member screen asks.
 *
 * A read that fails counts as seen: a fault shows nothing rather than a sheet
 * the member already closed.
 */
export async function championSheet(db: Db, memberId: number, groupId: number, now: Date): Promise<ChampionSheet | null> {
  try {
    const season = await activeSeason(db);
    const final = await db.query.weeks.findFirst({
      where: and(eq(weeks.seasonId, season.id), eq(weeks.weekNumber, REGULAR_SEASON_FINAL_WEEK)),
    });
    if (!final || !deadlinePassed(final, now)) return null;
    const [seen] = await db
      .select({ asChampion: championSheetViews.asChampion })
      .from(championSheetViews)
      .where(
        and(
          eq(championSheetViews.memberId, memberId),
          eq(championSheetViews.groupId, groupId),
          eq(championSheetViews.seasonId, season.id),
        ),
      )
      .limit(1);
    if (seen?.asChampion) return null;
    const { champion } = await seasonResult(db, groupId, now);
    if (!champion) return null;
    const viewerIsChampion = champion.members.some((m) => m.id === memberId);
    if (seen && !viewerIsChampion) return null;
    return { year: season.year, champions: champion.members, points: champion.points, viewerIsChampion };
  } catch (error) {
    console.warn("Champion sheet read failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Records that `member` has seen the sheet in `groupId`, however they
 * dismissed it, and whether they were the champion as they did. The champion
 * is graded again here rather than taken from the caller. Before there is one
 * there is no sheet to have seen, so nothing is written. A second sighting
 * keeps the first time, and only ever turns `asChampion` on.
 */
export async function seeChampionSheet(db: Db, member: Pick<Member, "id">, groupId: number, now: Date): Promise<void> {
  const { season, champion } = await seasonResult(db, groupId, now);
  if (!champion) return;
  const asChampion = champion.members.some((m) => m.id === member.id);
  await db
    .insert(championSheetViews)
    .values({ memberId: member.id, groupId, seasonId: season.id, asChampion, seenAt: now })
    .onConflictDoUpdate({
      target: [championSheetViews.memberId, championSheetViews.groupId, championSheetViews.seasonId],
      set: { asChampion: sql`${championSheetViews.asChampion} or excluded.as_champion` },
    });
}

export interface SeenRoute {
  db: Db;
  requireMember: () => Promise<Member>;
  /** The wall clock unless given. */
  now?: () => Date;
}

/**
 * The sheet's dismissal over an injected route, so the `"use server"` file
 * stays a line. Who saw it comes from the session; the group is checked
 * against the member's own, because anyone who can send the POST can send any
 * value.
 */
export async function seenFromAction(route: SeenRoute, groupId: unknown): Promise<void> {
  const member = await route.requireMember();
  const theirs = typeof groupId === "number" && (await memberGroups(route.db, member.id)).some((g) => g.group.id === groupId);
  if (!theirs) throw new InvalidChampionSheet(`Not a group of theirs: ${String(groupId)}.`);
  await seeChampionSheet(route.db, member, groupId, route.now?.() ?? new Date());
}
