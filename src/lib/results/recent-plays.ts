/**
 * The Game sheet's **Recent plays** card, worked out from what the plays
 * endpoint answers: this drive's plays, newest first, every scoring play
 * tagged and carrying the new score, and the recap line for the drive before.
 *
 * The rules are the resolution of "What does the Game sheet look like, live
 * and final?" (#265) and "Does Recent plays close a drive with a recap line?"
 * (#314). Teams are shortened to the feed's own play-text abbreviations
 * ("LIB", "CCU"), the same ones the field reads spots with, and fall back to
 * the team's name while the feed has not placed one.
 *
 * Pure and free of database imports: the Live Board runs it in the browser.
 */
import type { DriveRecap } from "./drive-recap";
import { abbreviations, type FieldTeams, type PlayDescription, type Side } from "./field";
import type { GamePlaysJson } from "./live-feed";

export type ScoreTag = "Touchdown" | "Extra point" | "Field goal" | "Safety";

export interface RecentPlay {
  id: string;
  /** The game clock after the play, "8:15". */
  clock: string;
  /** The feed's words. */
  text: string;
  /** Set only on a play that changed the score. */
  score: { tag: ScoreTag; line: string } | null;
}

export interface RecentPlays {
  /** The newest drive's plays, newest first. Empty while the feed has none for it yet. */
  plays: RecentPlay[];
  /** "LIB · Touchdown · 8 plays, 80 yds, 1:08". Null before the game's second drive. */
  recap: string | null;
}

/** The two teams as the card names them. */
export interface RecentTeams extends FieldTeams {
  homeTeam: string;
  awayTeam: string;
}

/**
 * The card's contents. Null for a game the feed has never been read for,
 * where the sheet leaves the card out altogether.
 */
export function recentPlays(feed: GamePlaysJson, teams: RecentTeams): RecentPlays | null {
  if (feed.fetchedAt === null) return null;
  const all = feed.drives.flatMap((drive) => drive.plays);
  const label = feedLabels(feed, teams);
  const descriptions = new Map(feed.descriptions.map((description) => [description.id, description]));

  // Scores are read against the play logged before, across drives, so the
  // first play of a drive is compared with the last of the one before it.
  const before = new Map<string, { home: number; away: number }>();
  let running = { home: 0, away: 0 };
  for (const play of all) {
    before.set(play.id, running);
    running = { home: play.homeScore, away: play.awayScore };
  }

  const newest = feed.drives.at(-1)?.plays ?? [];
  const plays = newest
    .map((play): RecentPlay => {
      const was = before.get(play.id) ?? { home: 0, away: 0 };
      const scored = play.homeScore !== was.home || play.awayScore !== was.away;
      return {
        id: play.id,
        clock: play.clock.replace(/^0(\d:)/, "$1"),
        text: play.playText,
        score: scored
          ? {
              tag: scoreTag(descriptions.get(play.id)),
              line: `${label.away} ${play.awayScore}–${play.homeScore} ${label.home}`,
            }
          : null,
      };
    })
    .reverse();
  return { plays, recap: recapLine(feed.recap, label) };
}

/** Each side's short name as the feed's play text writes it, the one the card and the field both use. */
export function feedLabels(feed: GamePlaysJson, teams: RecentTeams): Record<Side, string> {
  const sideOf = (teamId: number): Side | null =>
    teamId === teams.homeTeamId ? "home" : teamId === teams.awayTeamId ? "away" : null;
  return teamLabels(
    abbreviations(
      feed.drives.flatMap((drive) => drive.plays),
      sideOf,
    ),
    teams,
  );
}

/**
 * What a scoring play is tagged. The field's own label wherever it drew one;
 * any other score is the try after a touchdown the feed logged as a play of
 * its own. Most tries never are: the feed writes "(kick attempt good)" inside
 * the touchdown's text, and that row carries the point already.
 */
function scoreTag(description: PlayDescription | undefined): ScoreTag {
  const flash = description?.segments.find((segment) => segment.kind === "flash");
  return flash?.kind === "flash" ? flash.label : "Extra point";
}

/** Each side's short name: its abbreviation in the feed's play text, or its name before the feed has placed one. */
function teamLabels(abbrs: Map<string, Side>, teams: RecentTeams): Record<Side, string> {
  const labels: Record<Side, string> = { home: teams.homeTeam, away: teams.awayTeam };
  for (const [abbr, side] of abbrs) labels[side] = abbr;
  return labels;
}

function recapLine(recap: DriveRecap | null, label: Record<Side, string>): string | null {
  if (recap === null) return null;
  const parts = [recap.side === null ? null : label[recap.side], recap.result, recap.stats].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}
