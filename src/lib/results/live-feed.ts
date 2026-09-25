/**
 * CFBD's live play-by-play, reduced to what a Game's row carries: the newest
 * play as the feed wrote it, and the game header's down, distance and yards
 * to goal. The whole response — every drive and play — is stored beside the
 * Game for the Game sheet (`live_feeds`); this is the slice every screen
 * reading the Slate gets for free, so a poll of `/api/week/state` never loads
 * ninety kilobytes a game.
 *
 * Kept free of database imports, like `./result`, which reads it: a
 * `GameView` is built in the browser too. The feed's shape and quirks are in
 * docs/research/cfbd-live-plays.md.
 */
import type { CfbdLiveDrive, CfbdLiveGame, CfbdLivePlay } from "@/lib/cfbd/types";
import { ballSide, type FieldTeams, type PlayDescription, type Side } from "./field";

/** The newest play, as the Live Board row reads it. Text, type and team are the feed's own words. */
export interface LivePlay {
  id: string;
  /** The play in the feed's words, `playText`: "(10:31) K.Davis rush middle for 3 yards gain to the CCU31". */
  text: string;
  /** `playType`: "Rush", "Kickoff", "Timeout". Not reliable for turnovers; read the text. */
  type: string;
  /** The offense on a snap, the kicking team on a kick. Not necessarily who has the ball next. */
  teamId: number;
  team: string;
  period: number;
  /** The game clock after the play, "3:05". */
  clock: string;
  /** ISO 8601: when the play was logged upstream. Moves when the play is revised. */
  wallClock: string;
  /** The score after the play, extra point included. */
  homeScore: number;
  awayScore: number;
}

/** What a Game's row holds from the live feed. */
export interface LiveFeed {
  play: LivePlay;
  /**
   * The next snap's down, 1–4, from the game header. Null when the header
   * has none to give: it writes 0 after a timeout, -1 after a touchdown, and
   * null once final. `distance` is null with it.
   */
  down: number | null;
  distance: number | null;
  /**
   * The next snap's spot, measured from the team that ran the newest play —
   * the header's `possession`, which is the wrong team after a kick or a
   * turnover. Which side of the field it is on is not this module's to say.
   */
  yardsToGoal: number | null;
  /**
   * The team with the ball once the newest play is over, read from its words
   * (`ballSide`): the receiving team after a kick, the other team after a
   * turnover. Null at a break — a period's end, halftime, the final — and when
   * the feed names neither team. The Live Board's football, and the side of
   * the field `yardsToGoal` is counted towards.
   */
  ball: Side | null;
}

/** The newest play in the response. Plays are in `wallClock` order within and across drives, never in id order. */
export function newestPlay(drives: readonly CfbdLiveDrive[]): CfbdLivePlay | null {
  for (let d = drives.length - 1; d >= 0; d--) {
    const { plays } = drives[d];
    if (plays.length > 0) return plays[plays.length - 1];
  }
  return null;
}

/** The row's slice of one response. Null when the feed has logged no play for the game yet. */
export function toLiveFeed(feed: CfbdLiveGame, teams: FieldTeams): LiveFeed | null {
  const play = newestPlay(feed.drives);
  if (play === null) return null;
  const hasDown = feed.down !== null && feed.down >= 1 && feed.down <= 4;
  const header = {
    down: hasDown ? feed.down : null,
    distance: hasDown ? feed.distance : null,
    yardsToGoal: feed.yardsToGoal,
  };
  return {
    play: {
      id: play.id,
      text: play.playText,
      type: play.playType,
      teamId: play.teamId,
      team: play.team,
      period: play.period,
      clock: play.clock,
      wallClock: play.wallClock,
      homeScore: play.homeScore,
      awayScore: play.awayScore,
    },
    ...header,
    ball: ballSide(
      feed.drives.flatMap((drive) => drive.plays),
      teams,
      header,
    ),
  };
}

/** Seconds left on a game clock, from the scoreboard's "08:42" or the feed's "8:42". Null for anything else. */
function clockSeconds(clock: string | null): number | null {
  const match = clock?.match(/^(\d{1,2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Where the scoreboard last saw a game: its score and the moment in the game it was read at. */
export interface BoardMoment {
  homeScore: number;
  awayScore: number;
  period: number | null;
  clock: string | null;
}

/**
 * The running score to show: the feed's newest play's, whenever that play is
 * no earlier in the game than the scoreboard's moment, and the scoreboard's
 * otherwise.
 *
 * The feed leads `/scoreboard` by minutes and was never seen behind it, so a
 * tie in game time goes to the feed, and so does a moment either side cannot
 * place. Only a scoreboard that is plainly further on — a later quarter, or
 * less on the clock in the same one — keeps its own score, which is what a
 * stored feed looks like after its fetch has been failing for a while.
 */
export function newerScore(board: BoardMoment, feed: LiveFeed | null): { homeScore: number; awayScore: number } {
  const scoreboard = { homeScore: board.homeScore, awayScore: board.awayScore };
  if (feed === null) return scoreboard;
  const { play } = feed;
  const fromFeed = { homeScore: play.homeScore, awayScore: play.awayScore };
  if (board.period === null || play.period > board.period) return fromFeed;
  if (play.period < board.period) return scoreboard;
  const feedLeft = clockSeconds(play.clock);
  const boardLeft = clockSeconds(board.clock);
  if (feedLeft === null || boardLeft === null) return fromFeed;
  return feedLeft <= boardLeft ? fromFeed : scoreboard;
}

/**
 * What the Game sheet polls for one game: every drive with its plays as the
 * newest fetch stored them, when that fetch was, and every play's drawable
 * description for the field, in the order the plays were logged.
 * `fetchedAt` is null and `drives` and `descriptions` empty for a game the
 * feed has never been read for.
 */
export interface GamePlaysJson {
  gameId: number;
  /** ISO 8601. */
  fetchedAt: string | null;
  drives: CfbdLiveDrive[];
  /** One per play across `drives`, matched by `id`. Worked out on every request; nothing of it is stored. */
  descriptions: PlayDescription[];
}
