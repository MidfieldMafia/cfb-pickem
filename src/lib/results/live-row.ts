/**
 * The words a live Live Board row adds around the score (#209, as amended by
 * #311): the down-and-distance top-left, and the last-play line with the
 * play's age under the team lines. Read from the live feed's row slice
 * whenever the feed carries the game, and from `/scoreboard`'s own strings
 * only when it does not.
 *
 * Pure and client-safe, like `./result`: the row ticks the age in the browser.
 */
import { agoLabel } from "@/lib/week/freshness";
import { fromGoal } from "./field";
import { downLabel, spotLabel } from "./field-player";
import type { LiveScore } from "./result";

/** A play this long past its `wallClock` reads stale, unless it announced a break. */
export const STALE_PLAY_MS = 10 * 60_000;

/** The newest play types that announce a break, whose age is expected to grow. */
const BREAK = /^(end period|end of half|halftime|end of regulation)$/i;

/** Each side's name as the row's spot names it, before the feed has placed an abbreviation. */
export interface LiveRowTeams {
  homeTeam: string;
  awayTeam: string;
}

/**
 * "3rd & 7 at UGA 35", "1st & Goal at UGA 5", "3rd & 2 at 50". The feed
 * header's `yardsToGoal` counts towards the goal the team with the ball
 * attacks, so the spot is in the defending side's half under 50 and in the
 * offense's own over it. Null with no down to play — after a timeout or a
 * touchdown, at a break — and the top-left then stays empty.
 */
export function downAndDistance(live: Pick<LiveScore, "situation" | "feed">, teams: LiveRowTeams): string | null {
  const { feed } = live;
  if (feed === null) return live.situation;
  const { down, distance, yardsToGoal: toGoal, ball } = feed;
  if (down === null) return null;
  const line = downLabel(down, distance, toGoal);
  if (ball === null || toGoal === null) return line;
  const labels = { home: feed.homeAbbr ?? teams.homeTeam, away: feed.awayAbbr ?? teams.awayTeam };
  return `${line} at ${spotLabel(fromGoal(ball, toGoal), labels)}`;
}

/** The last-play line: the play's words, and its age when the feed logged it. */
export interface LastPlayLine {
  text: string;
  /** "40s ago". Null for the scoreboard's last play, which carries no time. */
  age: string | null;
  /** Ten minutes since the play with no break announced: the feed may have gone quiet on the game. */
  stale: boolean;
}

/**
 * The newest play's `playText` and age against `nowMs` (the server's clock),
 * or the scoreboard's `lastPlay` with no age when the feed carries no play.
 * Null when neither has one, and the row then has no last-play line at all.
 */
export function lastPlayLine(live: Pick<LiveScore, "lastPlay" | "feed">, nowMs: number): LastPlayLine | null {
  const { feed } = live;
  if (feed === null) return live.lastPlay === null ? null : { text: live.lastPlay, age: null, stale: false };
  const ageMs = nowMs - new Date(feed.play.wallClock).getTime();
  return {
    text: feed.play.text,
    age: agoLabel(ageMs),
    stale: ageMs >= STALE_PLAY_MS && !BREAK.test(feed.play.type),
  };
}
