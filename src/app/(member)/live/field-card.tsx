"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Card } from "@saturday-slate/design-system";

import { CREAM, INK, endZone, fitName, teamFill, textOn } from "@/lib/results/end-zones";
import type { PlayDescription, Side, TurnoverLabel } from "@/lib/results/field";
import {
  BALL_Y,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  drawingKey,
  feedBefore,
  fieldX,
  frame,
  newestDrawn,
  readout,
  timeline,
  type Readout,
  type Timeline,
} from "@/lib/results/field-player";
import type { GamePlaysJson } from "@/lib/results/live-feed";
import { feedLabels, type RecentTeams } from "@/lib/results/recent-plays";
import { logoSrc } from "@/lib/logos";

/** The field is its own scene, the same in light and dark: the canvas's greens and cream (#265). */
/** Each end zone on the drawing: ten yards at 2.8. */
const ZONE_DEPTH = 28;
const TURF = "#1F4034";
const CHALK = CREAM;
const GAIN = "#D26A12";
const LOSS = "#F08A6E";
const FLAG = "#F2C94C";

/** The pause before the snap, and the longer one while the chevron fades out first. */
const LEAD_MS = 300;
const CHEVRON_LEAD_MS = 700;

/** One play in the air: what it draws, its timing, and when (on `performance.now()`) the ball is snapped. */
interface Playing {
  description: PlayDescription;
  line: Timeline;
  snapAt: number;
  /** The replay on open, of a play the Live Board row has already shown the result of. */
  opening: boolean;
}

export interface FieldPlayer {
  /** The feed as the sheet shows it: without the play in the air, so nothing is spoiled. Null before the first poll. */
  shown: GamePlaysJson | null;
  /** The field's readouts and the header's score and clock, as of the last play that landed. */
  readout: Readout | null;
  /** Each side's abbreviation as the feed writes it: the end zone's last fallback for a long name. */
  labels: Record<Side, string> | null;
  /** The score while a play is in the air: each score step as the ball reaches it. */
  score: { home: number; away: number } | null;
  playing: Playing | null;
  /** The last play the field drew, once landed: its trail, X and flag stay on the field until the next snap. */
  rested: Omit<Playing, "snapAt" | "opening"> | null;
  /**
   * Whether the header should follow the field. Not during the replay on
   * open: the board row already showed that score, and counting it back down
   * to replay it would only look wrong.
   */
  holdsHeader: boolean;
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/**
 * The field's player: which play animates, when it lands, and what the rest
 * of the sheet may show meanwhile (#303, #310). Only the newest play that
 * draws anything animates. Plays that arrive with it go straight to the list,
 * and the field snaps to its start first. On open, the last play animates
 * once. A revision that changes the drawing replays once. Until the ball
 * lands, the list, the strip and the header's score and clock stay as they
 * were, and the score steps as the ball reaches each score.
 *
 * Unless the game is `live`, it passes the feed straight through.
 */
export function useFieldPlayer(feed: GamePlaysJson | null, teams: RecentTeams, live: boolean): FieldPlayer {
  const [playing, setPlaying] = useState<Playing | null>(null);
  const [score, setScore] = useState<{ home: number; away: number } | null>(null);
  const [rested, setRested] = useState<FieldPlayer["rested"]>(null);
  const animated = useRef<{ id: string; key: string } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!live || feed === null || feed.fetchedAt === null) return;
    const target = newestDrawn(feed);
    if (target === null) return;
    const key = drawingKey(target);
    const last = animated.current;
    // Nothing new to draw: a play in the air carries on, and lands on the newest feed.
    if (last && last.id === target.id && last.key === key) return;
    const opening = last === null;
    animated.current = { id: target.id, key };

    for (const timer of timers.current) clearTimeout(timer);
    const plays = feed.drives.flatMap((drive) => drive.plays);
    const index = plays.findIndex((play) => play.id === target.id);
    const prior = index > 0 ? plays[index - 1] : null;
    const was = prior ? { home: prior.homeScore, away: prior.awayScore } : { home: 0, away: 0 };
    const still = reducedMotion();
    const line = timeline(target, { was, still });
    const priorReadout = prior ? readout(feed, prior.id, teams, feedLabels(feed, teams)) : null;
    const lead = still ? 0 : priorReadout?.unmoved ? CHEVRON_LEAD_MS : LEAD_MS;
    const snapAt = performance.now() + lead;

    // Each step and the landing are timed off the same snap the drawing uses.
    const after = (ms: number, run: () => void) => timers.current.push(setTimeout(run, Math.max(0, snapAt + ms - performance.now())));
    timers.current = [];
    setScore(null);
    setPlaying({ description: target, line, snapAt, opening });
    for (const step of line.steps)
      if (step.kind === "score") after(step.t0, () => setScore({ home: step.home, away: step.away }));
    after(line.ms, () => {
      setPlaying(null);
      setScore(null);
      setRested({ description: target, line });
    });
  }, [feed, teams, live]);

  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
    },
    [],
  );

  if (!live || feed === null || feed.fetchedAt === null)
    return { shown: feed, readout: null, labels: null, score: null, playing: null, rested: null, holdsHeader: false };
  const shown = playing ? feedBefore(feed, playing.description.id) : feed;
  const newest = shown.drives.flatMap((drive) => drive.plays).at(-1);
  const labels = feedLabels(feed, teams);
  return {
    shown,
    readout: newest ? readout(feed, newest.id, teams, labels) : null,
    labels,
    score,
    playing,
    // Only while it is still the newest thing drawn.
    rested: rested && newestDrawn(feed)?.id === rested.description.id ? rested : null,
    holdsHeader: playing === null || !playing.opening,
  };
}

/** `performance.now()` on every frame while a play is in the air. */
function useFrameClock(running: boolean): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const tick = (t: number) => {
      setNow(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);
  return now;
}

/** "Last play 3m ago", from when the feed logged the newest landed play. */
function useAgo(wallClock: string | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  if (wallClock === null) return "";
  const seconds = Math.max(0, (now - Date.parse(wallClock)) / 1000);
  if (Number.isNaN(seconds) || seconds < 60) return "Last play just now";
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `Last play ${minutes}m ago` : `Last play ${Math.floor(minutes / 60)}h ago`;
}

/** The app's football, level, centred on the origin: the ball on the field and in the key. */
function BallGlyph() {
  return (
    <g transform="translate(-10 -10) scale(0.8333)">
      <ellipse cx="12" cy="12" rx="10.5" ry="6.2" fill="#A94B17" stroke={CHALK} strokeWidth="1.2" />
      <path d="M8 12H16M9.5 10.6v2.8M12 10.6v2.8M14.5 10.6v2.8" stroke={CHALK} strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </g>
  );
}

/** One of the Down / Ball on / Drive readouts. Its value never wraps. */
function Readout({ label, value, first }: { label: string; value: string; first?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 px-2 ${first ? "" : "border-l border-muted"}`}>
      <span className="text-[11px] leading-[14px] font-bold tracking-[0.08em] text-muted-foreground uppercase">{label}</span>
      <span className="text-[15px] leading-5 font-bold whitespace-nowrap tabular-nums">{value}</span>
    </div>
  );
}

/** True once the page's fonts have loaded, so a measure taken in the fallback font is taken again in Chivo. */
function useFontsReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);
  return ready;
}

/** Whether SVG text can be measured here: not in jsdom, which keeps the first guess. */
const canMeasure = (el: SVGTextElement | null): el is SVGTextElement => typeof el?.getComputedTextLength === "function";

/** The type of an end zone's name and its score flash: Chivo 900, caps (#395). */
const ZONE_TYPE = { className: "font-display", fontWeight: 900, textAnchor: "middle", dominantBaseline: "central" } as const;
const NAME_SIZE = 14;
const NAME_SPACING = 1;

/** Where an end zone's words sit, facing midfield: the away (left) end reads bottom to top, the home end top to bottom. */
const zoneTransform = (left: boolean) =>
  `translate(${left ? ZONE_DEPTH / 2 : FIELD_WIDTH - ZONE_DEPTH / 2} ${FIELD_HEIGHT / 2}) rotate(${left ? -90 : 90})`;

/**
 * One end zone, in its school's primary, with the longest of the school's
 * names that fits: measured in the drawing's own units, not estimated.
 */
function EndZone({ school, abbr, left }: { school: string; abbr: string; left: boolean }) {
  const zone = endZone(school, abbr);
  const probe = useRef<SVGTextElement>(null);
  const fonts = useFontsReady();
  const [name, setName] = useState(zone.names[0] ?? "");
  useLayoutEffect(() => {
    const el = probe.current;
    if (!canMeasure(el)) return;
    const width = (text: string) => {
      el.textContent = text;
      return el.getComputedTextLength();
    };
    setName(fitName(endZone(school, abbr).names, width));
  }, [school, abbr, fonts]);
  return (
    <g>
      <rect x={left ? 0 : FIELD_WIDTH - ZONE_DEPTH} width={ZONE_DEPTH} height={FIELD_HEIGHT} fill={zone.fill} />
      <text ref={probe} {...ZONE_TYPE} fontSize={NAME_SIZE} letterSpacing={NAME_SPACING} visibility="hidden" aria-hidden />
      <text transform={zoneTransform(left)} {...ZONE_TYPE} fontSize={NAME_SIZE} letterSpacing={NAME_SPACING} fill={zone.ink}>
        {name}
      </text>
    </g>
  );
}

/** The callout pill: 18 tall under the field, kept inside the goal lines, with room either side of its label. */
const CALLOUT_Y = 90;
const CALLOUT_HEIGHT = 18;
const CALLOUT_PADDING = 9;
const CALLOUT_INSET = 4;

/**
 * A turnover's callout (#395): a pill under the field in the colours of the
 * team that got the ball, with a chalk ring, and a chalk pointer up at the
 * spot where it changed hands.
 */
function Callout({ label, x, school }: { label: TurnoverLabel; x: number; school: string }) {
  const text = label.toUpperCase();
  const probe = useRef<SVGTextElement>(null);
  const fonts = useFontsReady();
  // The canvas's estimate until the browser has measured.
  const [textWidth, setTextWidth] = useState(text.length * 6.4);
  useLayoutEffect(() => {
    if (canMeasure(probe.current)) setTextWidth(probe.current.getComputedTextLength());
  }, [text, fonts]);
  const fill = teamFill(school);
  const width = Math.round(textWidth + 2 * CALLOUT_PADDING);
  const left = Math.max(ZONE_DEPTH + CALLOUT_INSET, Math.min(FIELD_WIDTH - ZONE_DEPTH - CALLOUT_INSET - width, x - width / 2));
  const type = { className: "font-display", fontWeight: 900, fontSize: 9.5, letterSpacing: 1 } as const;
  return (
    <g className="animate-in fade-in duration-500">
      <path d={`M${x} ${CALLOUT_Y - 7} L${x + 5} ${CALLOUT_Y} L${x - 5} ${CALLOUT_Y} Z`} fill={CHALK} />
      <rect
        x={left + 0.75}
        y={CALLOUT_Y + 0.75}
        width={width - 1.5}
        height={CALLOUT_HEIGHT - 1.5}
        rx={(CALLOUT_HEIGHT - 1.5) / 2}
        fill={fill}
        stroke={CHALK}
        strokeWidth="1.5"
      />
      <text ref={probe} {...type} visibility="hidden" aria-hidden>
        {text}
      </text>
      <text
        x={left + width / 2}
        y={CALLOUT_Y + CALLOUT_HEIGHT / 2}
        textAnchor="middle"
        dominantBaseline="central"
        {...type}
        fill={textOn(fill)}
      >
        {text}
      </text>
    </g>
  );
}

/** The yard lines every five yards, and the numbers along the top every ten. */
const YARD_LINES = Array.from({ length: 19 }, (_, i) => (i + 1) * 5);

/**
 * The Game sheet's "On the field" card (#310): the Down / Ball on / Drive
 * strip, the field with the last play, and the key. A player only: every
 * shape comes from the play's drawable description.
 */
export function FieldCard({
  player,
  awayTeam,
  homeTeam,
}: {
  player: FieldPlayer;
  awayTeam: string;
  homeTeam: string;
}) {
  const { playing, shown } = player;
  const now = useFrameClock(playing !== null);
  const newestShown = shown?.drives.flatMap((drive) => drive.plays).at(-1) ?? null;
  const ago = useAgo(newestShown?.wallClock ?? null);
  const at = player.readout;
  if (at === null) return null;

  const f = playing ? frame(playing.description, playing.line, Math.max(0, now - playing.snapAt)) : null;
  // At rest, the last play's drawing stays: its trail, the X and the flag. The ball and the marker go where the readout says.
  const drawn = playing ?? player.rested;
  const trace = f ?? (player.rested ? frame(player.rested.description, player.rested.line, Infinity) : null);
  // A kick or a turnover starts a new drive, so the band holds still for it.
  const sameDrive = playing !== null && !playing.description.segments.some((s) => s.kind === "possession");

  // In the air: the ball, the logo and (on the same drive) the band follow the play. Landed: the readout says where everything rests.
  const ballX = f ? f.ball.x : at.ball === null ? null : fieldX(at.ball);
  const side = f ? f.side : at.side;
  // The band follows the ball on the same drive, and holds still on a play that hands the ball over.
  const bandFrom = at.driveStart === null ? null : fieldX(at.driveStart);
  const bandTo = f && sameDrive ? f.ball.x : at.ball === null ? null : fieldX(at.ball);
  const showBand = bandFrom !== null && bandTo !== null && Math.abs(bandTo - bandFrom) > 0.5;
  // The scoring end zone lights as the ball reaches it and stays lit until the next play.
  const flash = f ? (f.flash ? { label: f.flash, x: f.ball.x } : null) : at.flash ? { label: at.flash.label, x: fieldX(at.flash.yard) } : null;
  const flashLeft = flash ? flash.x < FIELD_WIDTH / 2 : null;
  // A turnover's callout appears as the ball reaches the spot and rests until the next drawn play, like the flash.
  const callout = f ? f.turnover : at.turnover ? { ...at.turnover, x: fieldX(at.turnover.yard) } : null;
  const schoolOf = (s: Side) => (s === "away" ? awayTeam : homeTeam);
  const labels = player.labels ?? { away: awayTeam, home: homeTeam };
  const pinLogo = side === "away" ? logoSrc(awayTeam) : side === "home" ? logoSrc(homeTeam) : undefined;
  const chevron = playing === null && at.unmoved && side !== null;
  const who = at.side === "away" ? awayTeam : at.side === "home" ? homeTeam : null;
  const aria = [callout?.label ?? null, who ? `${who} has the ball` : null, `${at.down.replace("&", "and")}`, at.spot === "–" ? null : `ball on ${at.spot}`, `this drive: ${at.drive}`]
    .filter(Boolean)
    .join(", ");

  return (
    <Card className="grid gap-2 border-live p-2.5">
      <div className="flex items-baseline gap-2">
        <h3 className="flex-1 text-xs font-bold tracking-[0.08em] text-secondary uppercase">On the field</h3>
        <span className="text-xs text-muted-foreground">{playing ? "Play in progress" : ago}</span>
      </div>
      {/*
        The canvas's fixed 104 / 88 / 144, so nothing shifts as the values change. On a phone narrower
        than the card was drawn for, each column gives up its spare room but never its value.
      */}
      <div className="grid grid-cols-[minmax(max-content,104px)_minmax(max-content,88px)_minmax(max-content,144px)] justify-center border-y border-muted py-1.5 text-center">
        <Readout label="Down" value={at.down} first />
        <Readout label="Ball on" value={at.spot} />
        <Readout label="Drive" value={at.drive} />
      </div>
      <svg
        role="img"
        aria-label={aria}
        viewBox={`0 0 ${FIELD_WIDTH} ${FIELD_HEIGHT}`}
        className="block w-full overflow-hidden rounded-md"
      >
        <rect width={FIELD_WIDTH} height={FIELD_HEIGHT} fill={TURF} />
        <EndZone school={awayTeam} abbr={labels.away} left />
        <EndZone school={homeTeam} abbr={labels.home} left={false} />
        {flashLeft !== null ? (
          <g className="animate-in fade-in duration-500">
            <rect x={flashLeft ? 0 : FIELD_WIDTH - ZONE_DEPTH} width={ZONE_DEPTH} height={FIELD_HEIGHT} fill={GAIN} />
            <text transform={zoneTransform(flashLeft)} {...ZONE_TYPE} fontSize="13" letterSpacing="2" fill={INK}>
              {flash?.label.toUpperCase()}
            </text>
          </g>
        ) : null}
        <line x1={ZONE_DEPTH} x2={ZONE_DEPTH} y2={FIELD_HEIGHT} stroke={CHALK} strokeWidth="1.5" />
        <line x1={FIELD_WIDTH - ZONE_DEPTH} x2={FIELD_WIDTH - ZONE_DEPTH} y2={FIELD_HEIGHT} stroke={CHALK} strokeWidth="1.5" />
        {YARD_LINES.map((yard) => (
          <line
            key={yard}
            x1={fieldX(yard)}
            x2={fieldX(yard)}
            y1="4"
            y2="108"
            stroke={CHALK}
            strokeOpacity={yard % 10 === 0 ? 0.45 : 0.2}
          />
        ))}
        {YARD_LINES.filter((yard) => yard % 10 === 0).map((yard) => (
          <text
            key={yard}
            x={fieldX(yard)}
            y="16"
            textAnchor="middle"
            fontSize="10"
            fontWeight="700"
            fill={CHALK}
            fillOpacity="0.7"
          >
            {yard <= 50 ? yard : 100 - yard}
          </text>
        ))}

        {showBand ? (
          <rect x={Math.min(bandFrom, bandTo)} y="88" width={Math.abs(bandTo - bandFrom)} height="10" rx="2" fill={CHALK} fillOpacity="0.3" />
        ) : null}
        {/* The lines hold where the play started until it lands. */}
        {at.ball !== null ? (
          <g>
            {bandFrom !== null && at.driveStart !== at.ball ? (
              <line x1={bandFrom} x2={bandFrom} y1="84" y2="102" stroke={CHALK} strokeWidth="2" />
            ) : null}
            {at.gain !== null ? <line x1={fieldX(at.gain)} x2={fieldX(at.gain)} y1="4" y2="108" stroke={GAIN} strokeWidth="3" /> : null}
            <line x1={fieldX(at.ball)} x2={fieldX(at.ball)} y1="4" y2="108" stroke={CHALK} strokeWidth="2" />
          </g>
        ) : null}

        {ballX !== null && side !== null ? (
          <g transform={`translate(${ballX} 0)`}>
            <path
              d="M18 30 L23 34 L18 38"
              stroke={CHALK}
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              transform={side === "away" ? undefined : "scale(-1 1)"}
              style={{ opacity: chevron ? 1 : 0, transition: `opacity 0.4s ease ${chevron ? "0.3s" : "0s"}` }}
            />
            <path d="M-6 46 L6 46 L0 57 Z" fill={CHALK} fillOpacity="0.55" />
            <circle cy="34" r="14" fill={CHALK} fillOpacity="0.55" />
            {pinLogo ? <image href={pinLogo} x="-10" y="24" width="20" height="20" /> : null}
          </g>
        ) : null}

        {trace && drawn ? (
          <>
            {drawn.description.start !== null ? (
              <circle cx={fieldX(drawn.description.start)} cy={BALL_Y} r="3" fill={drawn.line.loss ? LOSS : CHALK} />
            ) : null}
            {trace.trail ? (
              <path
                d={trace.trail}
                stroke={drawn.line.loss ? LOSS : CHALK}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ) : null}
            {trace.flag !== null ? (
              <g transform={`translate(${trace.flag} ${BALL_Y + 4})`}>
                <line y1="0" y2="-14" stroke={CHALK} strokeWidth="1.5" />
                <path d="M0 -14 L9 -11 L0 -8 Z" fill={FLAG} />
              </g>
            ) : null}
            {trace.miss !== null ? (
              <path
                transform={`translate(${trace.miss} ${BALL_Y})`}
                d="M-5 -5 L5 5 M5 -5 L-5 5"
                stroke={LOSS}
                strokeWidth="3"
                strokeLinecap="round"
              />
            ) : null}
          </>
        ) : null}
        {callout ? (
          <Callout key={`${callout.label} ${callout.x}`} label={callout.label} x={callout.x} school={schoolOf(callout.side)} />
        ) : null}
        {ballX !== null ? (
          <g transform={`translate(${ballX} ${f ? f.ball.y : BALL_Y}) rotate(${f ? f.ball.angle : 0})`}>
            <BallGlyph />
          </g>
        ) : null}
      </svg>
      <p className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <svg aria-hidden width="28" height="18" viewBox="0 0 28 18" className="shrink-0 rounded-[3px]">
            <rect width="28" height="18" fill={TURF} />
            <line x1="14" y1="1" x2="14" y2="17" stroke={CHALK} strokeWidth="2" />
            <g transform="translate(14 9) scale(0.54)">
              <BallGlyph />
            </g>
          </svg>
          Ball
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg aria-hidden width="28" height="18" viewBox="0 0 28 18" className="shrink-0 rounded-[3px]">
            <rect width="28" height="18" fill={TURF} />
            <line x1="14" y1="1" x2="14" y2="17" stroke={GAIN} strokeWidth="3" />
          </svg>
          Line to gain
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg aria-hidden width="28" height="18" viewBox="0 0 28 18" className="shrink-0 rounded-[3px]">
            <rect width="28" height="18" fill={TURF} />
            <rect x="6" y="6" width="18" height="6" rx="1.5" fill={CHALK} fillOpacity="0.3" />
            <line x1="6" y1="3" x2="6" y2="15" stroke={CHALK} strokeWidth="2" />
          </svg>
          This drive
        </span>
      </p>
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {at.text}
      </p>
    </Card>
  );
}
