/**
 * What the Leaderboard's Week strip shows (#243, boards 7, 9 and 11 of the
 * #177 canvas): which view is selected, and one tile per view. Pure, so the
 * default-selection rule and the labels are held to the ticket by a test
 * rather than by eye.
 */
import type { GameResult } from "@/lib/results/result";
import type { GradedWeek, LeaderboardRow } from "@/lib/results/results";
import { ordinal } from "@/lib/results/summary";
import { plural } from "@/lib/plural";
import { weekParam } from "@/lib/slate/slate";

/** `?week=season` names the Season view outright; without it, a live Week would take the default back. */
export const SEASON_PARAM = "season";

/**
 * The Week still being played: the latest played Week while any of its
 * non-void games is live or still to kick off. Only the latest, so an old Week
 * stuck on a game the feed never completed cannot take over the default.
 */
export function weekInProgress(played: readonly GradedWeek[]): GradedWeek | null {
  const latest = played[played.length - 1];
  return latest && !latest.complete ? latest : null;
}

/**
 * The Week on screen, or null for Season. `?week=` wins when it names a played
 * Week; otherwise the Week in progress, otherwise Season.
 */
export function selectedWeek(played: readonly GradedWeek[], param: string | undefined): GradedWeek | null {
  if (param === SEASON_PARAM) return null;
  const requested = weekParam(param);
  return played.find((w) => w.week.weekNumber === requested) ?? weekInProgress(played);
}

export interface StripTile {
  key: string;
  /** The Season tile, wider than a Week and titled in small type. */
  season: boolean;
  href: string;
  /** "2026" over Season, "Wk" over a Week. */
  caption: string;
  /** "Season", or the Week's number. */
  title: string;
  /** The viewer's season place under Season, "3rd"; null on a Week, which shows no score. */
  place: string | null;
  won: boolean;
  live: boolean;
  current: boolean;
  label: string;
}

/** Season first, then every played Week newest first. */
export function stripTiles({
  year,
  played,
  leaderboard,
  viewerId,
  shown,
}: {
  year: number;
  played: readonly GradedWeek[];
  leaderboard: readonly LeaderboardRow[];
  viewerId: number;
  shown: GradedWeek | null;
}): StripTile[] {
  const mine = leaderboard.find((row) => row.member.id === viewerId);
  const going = weekInProgress(played);
  const season: StripTile = {
    key: SEASON_PARAM,
    season: true,
    href: `/leaderboard?week=${SEASON_PARAM}`,
    caption: String(year),
    title: "Season",
    place: mine ? ordinal(mine.rank) : null,
    won: false,
    live: false,
    current: shown === null,
    label: mine ? `Season standings, you are ${ordinal(mine.rank)}` : "Season standings",
  };
  const weeks = [...played].reverse().map((graded): StripTile => {
    const number = graded.week.weekNumber;
    const live = graded === going;
    const score = graded.scores.find((s) => s.member.id === viewerId);
    const won = graded.complete && (graded.weeklyWin?.winners.some((m) => m.id === viewerId) ?? false);
    const parts = [`Week ${number}`];
    if (live) parts.push("in progress");
    if (score?.played) parts.push(`${live ? "you have" : "you scored"} ${score.points}`);
    else if (score) parts.push("you made no picks");
    if (won) parts.push("Week winner");
    return {
      key: String(number),
      season: false,
      href: `/leaderboard?week=${number}`,
      caption: "Wk",
      title: String(number),
      place: null,
      won,
      live,
      current: shown?.week.weekNumber === number,
      label: parts.join(", "),
    };
  });
  return [season, ...weeks];
}

/**
 * "2 games live · 1 to kick off": what is left of a Week in progress, for the
 * card that links back to the Live Board. Finals and voids are done, so they
 * are not counted; "game" is said once, on whichever half comes first.
 */
export function gamesLeftLabel(results: readonly GameResult[]): string {
  const pending = results.filter((r) => r.status === "pending");
  const live = pending.filter((r) => r.live !== null).length;
  const toKickOff = pending.length - live;
  const parts: string[] = [];
  if (live > 0) parts.push(`${plural(live, "game")} live`);
  if (toKickOff > 0) parts.push(parts.length ? `${toKickOff} to kick off` : `${plural(toKickOff, "game")} to kick off`);
  return parts.join(" · ");
}
