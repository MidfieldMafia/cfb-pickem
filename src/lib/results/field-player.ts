/**
 * The Game sheet's "On the field" card, as numbers: when each step of a play's
 * drawable description happens, and where the ball is at any moment of it.
 * What the strip reads once a play has landed comes finished from the server
 * (`./game-feed`).
 *
 * The card is a player, not a parser (#310). Everything a play draws comes
 * from `describePlays` in ./field; this module only times those segments and
 * places them on the drawing. The look is the resolution of "What does the
 * Game sheet look like, live and final?" (#265), amended by "How does a live
 * play become an animation on the field?" (#303).
 *
 * Pure and free of database imports: it runs in the browser.
 */
import type { PlayDescription, Segment, Side, TurnoverLabel, Yard } from "./field";
import type { FeedPlay, GamePlaysJson } from "./game-feed";

/** The drawing is 336 × 112: each end zone is 28 wide, and a yard is 2.8. */
export const FIELD_WIDTH = 336;
export const FIELD_HEIGHT = 112;
/** How high the ball rides when it is on the ground. An arc rises from here. */
export const BALL_Y = 74;
/** The highest an arc's peak may reach, so a long kick never leaves the field. */
const TOP_Y = 8;

/** A yard line's x on the drawing: 0 is the away goal line, 100 the home one, -10 and 110 the end lines. */
export const fieldX = (yard: Yard): number => Math.round((yard + 10) * 28) / 10;

/** The first flight of a play, however far it goes: the canvas's constant 2.8 s. */
const FLIGHT_MS = 2800;
/** Any later flight in the same play, such as the extra point after a touchdown. */
const SECOND_FLIGHT_MS = 1400;
const FLAG_MS = 400;
const SLIDE_MS = 1200;
const MISS_MS = 600;
const JUMP_MS = 400;
/** The header counts a score up at 145 ms a point (#265); the next step waits for it. */
const POINT_MS = 145;

/** One timed step of a play. `t0` is when it begins, in ms from the snap. */
export type Step = Segment & { t0: number; ms: number };

export interface Timeline {
  steps: Step[];
  /** When the ball has landed and the play is over. */
  ms: number;
  /** A play that loses yards draws its trail in red. */
  loss: boolean;
}

const isFlight = (segment: Segment): segment is Extract<Segment, { kind: "arc" | "ground" }> =>
  segment.kind === "arc" || segment.kind === "ground";

/**
 * When each segment of a play happens. Consecutive flights share one duration
 * split by how far each goes, so the ball keeps a constant horizontal speed
 * across a catch and the run after it. `was` is the score before the play, so
 * a score step waits as long as its points take to count. With `still`
 * (reduced motion), every step takes no time and the play lands at once.
 */
export function timeline(
  description: PlayDescription,
  { was = { home: 0, away: 0 }, still = false }: { was?: { home: number; away: number }; still?: boolean } = {},
): Timeline {
  const segments = description.segments;
  const steps: Step[] = [];
  let at = 0;
  let before = was;
  let flights = 0;
  for (let i = 0; i < segments.length; ) {
    const segment = segments[i];
    if (isFlight(segment)) {
      let j = i;
      while (j < segments.length && isFlight(segments[j])) j++;
      const group = segments.slice(i, j) as Extract<Segment, { kind: "arc" | "ground" }>[];
      const total = group.reduce((sum, g) => sum + Math.abs(g.to - g.from), 0);
      const groupMs = still ? 0 : flights === 0 ? FLIGHT_MS : SECOND_FLIGHT_MS;
      for (const g of group) {
        const ms = total === 0 ? groupMs / group.length : (groupMs * Math.abs(g.to - g.from)) / total;
        steps.push({ ...g, t0: at, ms });
        at += ms;
      }
      flights++;
      i = j;
      continue;
    }
    let ms = 0;
    if (!still) {
      if (segment.kind === "penalty") ms = FLAG_MS + SLIDE_MS;
      else if (segment.kind === "miss") ms = MISS_MS;
      else if (segment.kind === "jump") ms = JUMP_MS;
      else if (segment.kind === "score") {
        const points = Math.max(segment.home - before.home, segment.away - before.away, 0);
        // Only wait for the count when something else is still to come.
        ms = i < segments.length - 1 ? points * POINT_MS : 0;
      }
    }
    if (segment.kind === "score") before = { home: segment.home, away: segment.away };
    steps.push({ ...segment, t0: at, ms });
    at += ms;
    i++;
  }
  const first = segments.find((s) => isFlight(s) || s.kind === "penalty");
  const forwards = description.side === "home" ? -1 : 1;
  const loss = first !== undefined && first.kind !== "penalty" && (first.to - first.from) * forwards < 0;
  return { steps, ms: at, loss };
}

/** How high an arc of this length peaks above the ground line, in drawing units. */
export function rise(from: Yard, to: Yard): number {
  return Math.min(BALL_Y - TOP_Y, 14 + 0.85 * Math.abs(to - from));
}

/** A point on a flight, `u` of the way along it (0–1). */
function along(step: Extract<Step, { kind: "arc" | "ground" }>, u: number) {
  const x0 = fieldX(step.from);
  const x1 = fieldX(step.to);
  const dx = x1 - x0;
  if (step.kind === "ground") return { x: x0 + dx * u, y: BALL_Y, angle: 0 };
  const h = rise(step.from, step.to);
  const dy = -4 * h * (1 - 2 * u);
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (dx < 0) angle -= 180;
  return { x: x0 + dx * u, y: BALL_Y - 4 * h * u * (1 - u), angle };
}

/** The field at one moment of a play. */
export interface Frame {
  ball: { x: number; y: number; angle: number };
  /** The trail drawn so far, as an SVG path. Empty before the first flight. */
  trail: string;
  /** Where the X is, once a pass has fallen incomplete or a kick has missed. */
  miss: number | null;
  /** Where the penalty flag lies, once thrown. */
  flag: number | null;
  flash: Extract<Segment, { kind: "flash" }>["label"] | null;
  /** The turnover callout, once the ball has reached the spot where it changed hands: `x` is that spot on the drawing. */
  turnover: { label: TurnoverLabel; x: number; side: Side } | null;
  /** Whose logo rides the marker: the snapping team, until a possession step swaps it. */
  side: Side | null;
  /** The ball has moved from the spot along the ground or through the air: the drive band follows it. */
  moved: boolean;
  /** The play's last score step reached so far, or null before any. */
  score: { home: number; away: number } | null;
  done: boolean;
}

/** Where everything is `ms` after the snap. */
export function frame(description: PlayDescription, line: Timeline, ms: number): Frame {
  const start = description.start ?? 50;
  const out: Frame = {
    ball: { x: fieldX(start), y: BALL_Y, angle: 0 },
    trail: "",
    miss: null,
    flag: null,
    flash: null,
    turnover: null,
    side: description.side,
    moved: false,
    score: null,
    done: ms >= line.ms,
  };
  const trail: string[] = [];
  let pen: number | null = null;
  const draw = (x: number, y: number, move = false) => {
    trail.push(`${move ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
    pen = x;
  };
  for (const step of line.steps) {
    if (ms < step.t0) break;
    const u = step.ms === 0 ? 1 : Math.min(1, (ms - step.t0) / step.ms);
    switch (step.kind) {
      case "arc":
      case "ground": {
        const n = Math.max(1, Math.ceil(24 * u));
        // A flight that starts somewhere else, like the extra point after the touchdown, is a new line.
        if (pen === null || Math.abs(pen - fieldX(step.from)) > 0.05) draw(fieldX(step.from), BALL_Y, true);
        for (let k = 1; k <= n; k++) {
          const p = along(step, (u * k) / n);
          draw(p.x, p.y);
        }
        const p = along(step, u);
        out.ball = { ...p, angle: u >= 1 ? 0 : p.angle };
        out.moved = true;
        break;
      }
      case "penalty": {
        out.flag = fieldX(step.flag);
        const slide = step.ms === 0 ? 1 : Math.max(0, (ms - step.t0 - FLAG_MS) / SLIDE_MS);
        const s = Math.min(1, slide);
        out.ball = { x: fieldX(step.from) + (fieldX(step.to) - fieldX(step.from)) * s, y: BALL_Y, angle: 0 };
        break;
      }
      case "miss":
        out.miss = fieldX(step.at);
        break;
      case "jump":
        out.ball = { x: fieldX(step.to), y: BALL_Y, angle: 0 };
        break;
      case "possession":
        out.side = step.side;
        break;
      case "flash":
        out.flash = step.label;
        break;
      case "turnover":
        out.turnover = { label: step.label, x: fieldX(step.at), side: step.side };
        break;
      case "score":
        out.score = { home: step.home, away: step.away };
        break;
    }
  }
  out.trail = trail.join(" ");
  return out;
}

/**
 * The play the field animates: the newest one that draws anything. A timeout
 * or a period's end after it draws nothing and lands along with it. Null when
 * no play in the feed draws anything yet.
 */
export function newestDrawn(feed: GamePlaysJson): PlayDescription | null {
  return feed.plays.findLast((play) => play.description.segments.length > 0)?.description ?? null;
}

/**
 * What the field compares to tell a revision that changes the drawing from one
 * that only changes the words: the same play id with a different key replays.
 */
export const drawingKey = (description: PlayDescription): string =>
  JSON.stringify([description.start, description.side, description.segments]);

/**
 * The feed as it stood before a play landed: every play logged before `id`,
 * and nothing after. Recent plays is built from this while the play is in the
 * air, so the list only grows when the ball lands. The recap line is kept
 * only while the newest drive still has a play on show, because it describes
 * the drive before the newest.
 */
export function feedBefore(feed: GamePlaysJson, id: string): GamePlaysJson {
  const at = feed.plays.findIndex((play) => play.id === id);
  const plays = at === -1 ? feed.plays : feed.plays.slice(0, at);
  const drive = plays.at(-1)?.drive ?? -1;
  return { ...feed, plays, drive, recap: drive === feed.drive ? feed.recap : null };
}

/** The pause before the snap, and the longer one while the chevron fades out first. */
const LEAD_MS = 300;
const CHEVRON_LEAD_MS = 700;

/** One play the field has started: what it draws, its timing, and when (on the caller's clock) the ball is snapped. */
export interface Playing {
  description: PlayDescription;
  line: Timeline;
  snapAt: number;
  /** The replay on open, of a play the Live Board row has already shown the result of. */
  opening: boolean;
}

/** Whether `last` is already the field's run of `target`: the same play with the same drawing. */
const started = (last: Playing | null, target: PlayDescription | null): last is Playing =>
  last !== null && target !== null && last.description.id === target.id && drawingKey(last.description) === drawingKey(target);

const passing = (feed: GamePlaysJson | null, live: boolean): feed is GamePlaysJson =>
  live && feed !== null && feed.fetchedAt !== null;

/**
 * The field player's one decision (#303, #310): what it is playing once
 * `feed` arrives at `now`, given `last`, the play it last started — in the
 * air, or landed — or null before the first. Only the newest play that draws
 * anything animates; plays that arrive with it go straight to the list, and
 * the field snaps to its start first. On open, the last play animates once. A
 * revision that changes the drawing replays once; the same drawing again
 * carries on, and answers `last` itself. With `still` (reduced motion), the
 * play lands the moment it starts.
 *
 * Unless the game is `live`, nothing plays and `last` is kept.
 */
export function receive(
  last: Playing | null,
  feed: GamePlaysJson | null,
  { live, now, still }: { live: boolean; now: number; still: boolean },
): Playing | null {
  if (!passing(feed, live)) return last;
  const target = newestDrawn(feed);
  if (target === null || started(last, target)) return last;
  const index = feed.plays.findIndex((play) => play.id === target.id);
  const prior = index > 0 ? feed.plays[index - 1] : null;
  const line = timeline(target, { was: prior?.score ?? { home: 0, away: 0 }, still });
  const lead = still ? 0 : prior?.readout.unmoved ? CHEVRON_LEAD_MS : LEAD_MS;
  return { description: target, line, snapAt: now + lead, opening: last === null };
}

/** What the Game sheet may show of the field and the plays at one moment. */
export interface FieldPlayer {
  /** The feed as the sheet shows it: without the play in the air, so nothing is spoiled. Null before the first poll. */
  shown: GamePlaysJson | null;
  /** The last play that landed: the field's readouts, and the header's score and clock. */
  landed: FeedPlay | null;
  /** Each side's abbreviation as the feed writes it: the end zone's last fallback for a long name. */
  labels: Record<Side, string> | null;
  /** The score while a play is in the air: each score step as the ball reaches it. */
  score: { home: number; away: number } | null;
  /** The play in the air, the pause before its snap included. */
  playing: Playing | null;
  /** The last play the field drew, once landed: its trail, X and flag stay on the field until the next snap. */
  rested: Omit<Playing, "snapAt" | "opening"> | null;
  /**
   * Whether the header should follow the field. Not during the replay on
   * open: the board row already showed that score, and counting it back down
   * to replay it would only look wrong.
   */
  holdsHeader: boolean;
  /** When this view next changes on its own — the next score step, or the landing — on the caller's clock. Null with nothing in the air. */
  wakeAt: number | null;
}

/**
 * The sheet at `now`, with `last` as `receive` left it. Until the ball
 * lands, the list, the strip and the header's score and clock stay as they
 * were, and the score steps as the ball reaches each score.
 *
 * A newest drawn play that `receive` has not started yet — a render with the
 * new feed, before the player has seen it — is held back as if in the air, so
 * not even one frame shows it early.
 */
export function playerView(last: Playing | null, feed: GamePlaysJson | null, live: boolean, now: number): FieldPlayer {
  if (!passing(feed, live))
    return { shown: feed, landed: null, labels: null, score: null, playing: null, rested: null, holdsHeader: false, wakeAt: null };
  const target = newestDrawn(feed);
  const current = started(last, target) ? last : null;
  const landsAt = current ? current.snapAt + current.line.ms : null;
  const playing = current && landsAt !== null && now < landsAt ? current : null;
  const pending = target !== null && current === null;
  const held = playing ? playing.description.id : pending ? target.id : null;
  const shown = held === null ? feed : feedBefore(feed, held);

  let score: FieldPlayer["score"] = null;
  let wakeAt: number | null = null;
  if (playing && landsAt !== null) {
    wakeAt = landsAt;
    for (const step of playing.line.steps) {
      if (step.kind !== "score") continue;
      const at = playing.snapAt + step.t0;
      if (at > now) {
        wakeAt = Math.min(wakeAt, at);
        break;
      }
      score = { home: step.home, away: step.away };
    }
  }

  return {
    shown,
    landed: shown.plays.at(-1) ?? null,
    labels: feed.labels,
    score,
    playing,
    rested: current && !playing ? { description: current.description, line: current.line } : null,
    // A play about to replay on open holds the header back as its run will.
    holdsHeader: playing ? !playing.opening : !(pending && last === null),
    wakeAt,
  };
}
