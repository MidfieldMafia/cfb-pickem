/**
 * One Slate game's live feed as the Game sheet shows it, worked out once on
 * the server from what the stale gate stored: each side's short name, and
 * every play with its words, its score tag, its drawing and what the On the
 * field card reads once it has landed. The phone receives finished views and
 * only times them (`./field-player`): no CFBD shape crosses the wire, and no
 * rule about downs, spots or drives runs in the browser.
 *
 * The Recent plays rules are the resolution of "What does the Game sheet look
 * like, live and final?" (#265) and "Does Recent plays close a drive with a
 * recap line?" (#314); the readout's are #310's, amended by #391.
 *
 * Pure and free of database imports: `./plays` reads the stored feed and
 * calls this, and the screens import its types and `recentPlays`.
 */
import type { CfbdLiveDrive, CfbdLivePlay } from "@/lib/cfbd/types";
import type { FinalStats } from "./box-score";
import { recapPreviousDrive, type DriveRecap } from "./drive-recap";
import { isMarker, sideAbbreviations, sideOf, type FieldTeams, type PlayDescription, type Segment, type Side, type TurnoverLabel, type Yard } from "./field";
import { clockLabel } from "./result";

export type ScoreTag = "Touchdown" | "Extra point" | "Field goal" | "Safety";

/** The Down / Ball on / Drive strip and the lines on the field, once a play has landed. */
export interface Readout {
  down: string;
  spot: string;
  drive: string;
  /** The white line and the logo marker. Null when nothing says where the ball is, such as after a touchdown. */
  ball: Yard | null;
  /** The orange line. Null with no down to play. */
  gain: Yard | null;
  /** Where the drive band starts. Null with no drive under way. */
  driveStart: Yard | null;
  side: Side | null;
  /** The drive hasn't moved from where it started: a new 1st & 10, or after an incompletion or no gain. The chevron shows. */
  unmoved: boolean;
  /** The end zone lit by the landed play's score, at the yard the ball reached. It stays lit until the next play. */
  flash: { label: Extract<Segment, { kind: "flash" }>["label"]; yard: Yard } | null;
  /** The landed play's turnover callout, at the yard the ball changed hands. It stays until the next drawn play. */
  turnover: { label: TurnoverLabel; yard: Yard; side: Side } | null;
}

/** One play, finished for the sheet. */
export interface FeedPlay {
  id: string;
  /** Which of the feed's drives the play is filed under, counting from 0. */
  drive: number;
  /** The game clock after the play, "8:15", as Recent plays lists it. */
  clock: string;
  /** The period and the clock after the play, "Q3 · 8:15", as the sheet's header shows it once the play has landed. */
  gameClock: string | null;
  /** The feed's words. */
  text: string;
  /** ISO 8601: when the feed logged the play. */
  wallClock: string;
  /** The score once the play is over, extra point included. */
  score: { home: number; away: number };
  /** Set only on a play that changed the score: its tag and the new score, "LIB 7–0 CCU". */
  scored: { tag: ScoreTag; line: string } | null;
  /** What the field draws for it. Empty segments for a timeout or a period's end. */
  description: PlayDescription;
  /** What the field reads once this play has landed. */
  readout: Readout;
}

/**
 * What the Game sheet polls for one game. `fetchedAt` is null, `plays`
 * empty and `drive` -1 for a game the feed has never been read for.
 */
export interface GamePlaysJson {
  gameId: number;
  /** ISO 8601. */
  fetchedAt: string | null;
  /** Each side's short name as the feed's play text writes it ("LIB"), or the team's name before the feed has placed one. */
  labels: Record<Side, string>;
  /** Every play the feed has logged, in the order it logged them. */
  plays: FeedPlay[];
  /** The newest drive the feed has opened, as `FeedPlay.drive` counts. Recent plays lists its plays. */
  drive: number;
  /** "LIB · Touchdown · 8 plays, 80 yds, 1:08": the drive before the newest. Null before the second drive. */
  recap: string | null;
  /**
   * The final sheet's team stats, game leaders and bar colours. Null for "not
   * yet": the game is not final, or CFBD has not published its stats.
   */
  final: FinalStats | null;
}

/** The two teams, by id and by name. */
export interface GameTeams extends FieldTeams {
  homeTeam: string;
  awayTeam: string;
}

/** What the stale gate stored for one game, and each play's drawing from `describePlays`. */
export interface StoredFeed {
  gameId: number;
  fetchedAt: string | null;
  drives: readonly CfbdLiveDrive[];
  /** One per play across `drives`, matched by id. */
  descriptions: readonly PlayDescription[];
  final: FinalStats | null;
}

/** The sheet's view of one game's stored feed. */
export function gameFeed(stored: StoredFeed, teams: GameTeams): GamePlaysJson {
  const { drives } = stored;
  const all = drives.flatMap((drive) => drive.plays);
  const placed = sideAbbreviations(all, teams);
  const labels = { home: placed.home ?? teams.homeTeam, away: placed.away ?? teams.awayTeam };
  const descriptions = new Map(stored.descriptions.map((description) => [description.id, description]));
  const source: Source = { drives, all, descriptions, teams, labels };

  const plays: FeedPlay[] = [];
  // Scores are read against the play logged before, across drives, so the
  // first play of a drive is compared with the last of the one before it.
  let was = { home: 0, away: 0 };
  drives.forEach((drive, index) => {
    for (const play of drive.plays) {
      const description = descriptions.get(play.id) ?? blank(play.id);
      const scored = play.homeScore !== was.home || play.awayScore !== was.away;
      plays.push({
        id: play.id,
        drive: index,
        clock: play.clock.replace(/^0(\d:)/, "$1"),
        gameClock: clockLabel({ period: play.period, clock: play.clock }),
        text: play.playText,
        wallClock: play.wallClock,
        score: { home: play.homeScore, away: play.awayScore },
        scored: scored ? { tag: scoreTag(description), line: `${labels.away} ${play.awayScore}–${play.homeScore} ${labels.home}` } : null,
        description,
        readout: readout(source, play.id),
      });
      was = { home: play.homeScore, away: play.awayScore };
    }
  });

  return {
    gameId: stored.gameId,
    fetchedAt: stored.fetchedAt,
    labels,
    plays,
    drive: drives.length - 1,
    recap: recapLine(recapPreviousDrive(drives, teams), labels),
    final: stored.final,
  };
}

export interface RecentPlays {
  /** The newest drive's plays, newest first. Empty while the feed has none for it yet. */
  plays: FeedPlay[];
  recap: string | null;
}

/**
 * The Game sheet's **Recent plays** card: this drive's plays, newest first,
 * every scoring play tagged and carrying the new score, and the recap line
 * for the drive before. Null for a game the feed has never been read for,
 * where the sheet leaves the card out altogether.
 */
export function recentPlays(feed: GamePlaysJson): RecentPlays | null {
  if (feed.fetchedAt === null) return null;
  return { plays: feed.plays.filter((play) => play.drive === feed.drive).reverse(), recap: feed.recap };
}

/** A play with no drawing: what `describePlays` gives a timeout. */
const blank = (id: string): PlayDescription => ({ id, start: null, side: null, segments: [], rest: { spot: null, side: null, down: null, distance: null } });

/**
 * What a scoring play is tagged. The field's own label wherever it drew one;
 * any other score is the try after a touchdown the feed logged as a play of
 * its own. Most tries never are: the feed writes "(kick attempt good)" inside
 * the touchdown's text, and that row carries the point already.
 */
function scoreTag(description: PlayDescription): ScoreTag {
  const flash = description.segments.find((segment) => segment.kind === "flash");
  return flash?.kind === "flash" ? flash.label : "Extra point";
}

function recapLine(recap: DriveRecap | null, label: Record<Side, string>): string | null {
  if (recap === null) return null;
  const parts = [recap.side === null ? null : label[recap.side], recap.result, recap.stats].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

const ORDINAL = ["", "1st", "2nd", "3rd", "4th"];

/** "3rd & 7", or "1st & Goal" once the distance reaches the goal line. "–" for a distance the feed hasn't given. */
export function downLabel(down: number, distance: number | null, yardsToGoal: number | null): string {
  const goal = distance !== null && yardsToGoal !== null && distance >= yardsToGoal;
  return `${ORDINAL[down]} & ${goal ? "Goal" : (distance ?? "–")}`;
}

/** "UGA 28", "50", or "End zone", from the team labels the Recent plays card uses. */
export function spotLabel(spot: Yard, labels: Record<Side, string>): string {
  if (spot < 0 || spot > 100) return "End zone";
  if (spot === 50) return "50";
  return spot < 50 ? `${labels.away} ${Math.round(spot)}` : `${labels.home} ${Math.round(100 - spot)}`;
}

/** "3 plays, 25 yds", "1 play, 1 yd", "2 plays, −7 yds". */
function driveLabel(plays: number, yards: number | null): string {
  if (plays === 0) return "Just started";
  const count = `${plays} ${plays === 1 ? "play" : "plays"}`;
  if (yards === null) return count;
  const n = Math.round(yards);
  return `${count}, ${n < 0 ? "−" : ""}${Math.abs(n)} ${Math.abs(n) === 1 ? "yd" : "yds"}`;
}

/** Everything a readout is read from. */
interface Source {
  drives: readonly CfbdLiveDrive[];
  all: readonly CfbdLivePlay[];
  descriptions: Map<string, PlayDescription>;
  teams: FieldTeams;
  labels: Record<Side, string>;
}

/**
 * What the card reads once the play `id` has landed. Everything comes from
 * the plays and their descriptions: the ball, the side and the next down from
 * the play's resting state, the drive from the feed's drive holding it.
 *
 * A timeout or a period's end lands along with the play before it, so it
 * reads as that play does. Read on its own, a
 * marker after a score would lose the drive's yards, as nothing yet says
 * where the next snap is (#391).
 */
function readout(source: Source, id: string): Readout {
  const { all } = source;
  const at = all.findIndex((play) => play.id === id);
  const landed = all[at];
  const lastSnap =
    landed && isMarker(landed.playType) ? all.slice(0, at).findLast((play) => !isMarker(play.playType)) : undefined;
  return readPlay(source, lastSnap ? lastSnap.id : id);
}

/** The readout for one play read on its own, marker or not. */
function readPlay({ drives, descriptions, teams, labels }: Source, id: string): Readout {
  const drive = drives.find((d) => d.plays.some((play) => play.id === id));
  const plays = drive?.plays ?? [];
  const landed = descriptions.get(id);
  const rest = landed?.rest ?? { spot: null, side: null, down: null, distance: null };
  const flash = landed?.segments.find((segment) => segment.kind === "flash");
  const turnover = landed?.segments.find((segment) => segment.kind === "turnover");
  const forwards = (side: Side) => (side === "away" ? 1 : -1);

  // The down: the next snap's, or what comes after a score.
  let down = "–";
  if (rest.down !== null && rest.side !== null) {
    const toGoal = rest.spot === null ? null : rest.side === "away" ? 100 - rest.spot : rest.spot;
    down = downLabel(rest.down, rest.distance, toGoal);
  } else if (flash?.kind === "flash") {
    down = flash.label === "Safety" ? "Free kick" : "Kickoff";
  }

  const gain =
    rest.down !== null && rest.distance !== null && rest.spot !== null && rest.side !== null
      ? Math.min(100, Math.max(0, rest.spot + forwards(rest.side) * rest.distance))
      : null;

  // The drive: the plays its offense has run so far. A play that handed the
  // ball over without a score, a kick or a turnover, starts a new drive at
  // the spot, whichever drive the feed filed it under.
  const offense = drive ? sideOf(teams)(drive.offenseId) : null;
  let driveText = "–";
  let driveStart: Yard | null = null;
  if (flash === undefined && rest.side !== null && rest.side !== offense) {
    driveText = driveLabel(0, null);
    driveStart = rest.spot;
  } else if (drive && offense !== null) {
    const run = plays.slice(0, plays.findIndex((p) => p.id === id) + 1);
    const first = run[0];
    const firstDescription = descriptions.get(first.id);
    driveStart = first.teamId === drive.offenseId ? (firstDescription?.start ?? null) : (firstDescription?.rest.spot ?? null);
    const snaps = run.filter((p) => p.teamId === drive.offenseId && !isMarker(p.playType)).length;
    const end =
      flash?.kind === "flash"
        ? flash.label === "Touchdown"
          ? offense === "away"
            ? 100
            : 0
          : (landed?.start ?? null)
        : rest.spot;
    const yards = driveStart === null || end === null ? null : (end - driveStart) * forwards(offense);
    driveText = driveLabel(snaps, yards);
    if (flash !== undefined) driveStart = null;
  }

  return {
    down,
    spot: rest.spot === null ? "–" : spotLabel(rest.spot, labels),
    drive: driveText,
    ball: rest.spot,
    gain,
    driveStart,
    side: rest.side,
    unmoved: rest.down !== null && rest.spot !== null && driveStart !== null && rest.spot === driveStart,
    flash: flash?.kind === "flash" && landed ? { label: flash.label, yard: flashYard(landed) } : null,
    turnover: turnover?.kind === "turnover" ? { label: turnover.label, yard: turnover.at, side: turnover.side } : null,
  };
}

/** Where the ball was when a play's flash went up: the end of the flight before it. */
function flashYard(description: PlayDescription): Yard {
  let yard = description.start ?? 50;
  for (const segment of description.segments) {
    if (segment.kind === "flash") break;
    if (segment.kind === "arc" || segment.kind === "ground" || segment.kind === "jump") yard = segment.to;
    if (segment.kind === "penalty") yard = segment.to;
  }
  return yard;
}
