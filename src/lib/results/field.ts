/**
 * The Game sheet's field, worked out from the live play-by-play: every play
 * turned into a **drawable description**, an ordered list of segments on one
 * fixed field plus where the ball rests afterwards. The screen only plays the
 * segments back; it never reads a play's text itself.
 *
 * The rules are the resolution of "How does a live play become an animation on
 * the field?" (#303). Spots come from `playText` first, because the numbers
 * cannot carry them: a kick's landing, a catch, a thrown-to spot and a
 * penalty's direction exist only in the words. Where nothing parses, the end
 * spot is the next play's start (skipping timeouts and period markers), then
 * the game header for the newest play. `yardsGained` and `playType` are never
 * trusted for direction or possession: the feed files a lost fumble as
 * "Fumble Recovery (Own)" and gives a kick its return yards. The feed's
 * grammar and quirks are in docs/research/cfbd-live-plays.md.
 *
 * Built at read time from the stored plays, so a fix here applies to games
 * already ingested. Pure and free of database imports: the Live Board reads
 * the newest play's side with the ball through `toLiveFeed`, and anything here
 * may run in the browser.
 */
import type { CfbdLivePlay } from "@/lib/cfbd/types";

export type Side = "home" | "away";

/**
 * A point on the field, in yards from the away team's goal line: 0 is the away
 * goal line, 100 the home goal line, 50 midfield. The away team attacks
 * towards 100. The end zones run to -10 and 110, the end lines, where the
 * posts stand.
 */
export type Yard = number;

/** One step of a play's animation, in the order the screen plays them. */
export type Segment =
  /** The ball in the air: a pass, a kick, an extra point. */
  | { kind: "arc"; from: Yard; to: Yard }
  /** The ball carried along the ground: a run, a sack, a return, the yards after a catch. */
  | { kind: "ground"; from: Yard; to: Yard }
  /** The X where a pass fell incomplete or a kick missed. */
  | { kind: "miss"; at: Yard }
  /** A flag at `flag`, then the ball slides from one spot to the other with no flight. */
  | { kind: "penalty"; flag: Yard; from: Yard; to: Yard }
  /** The ball moves with no flight: back to the line after an incompletion, or on to a spot the feed says. */
  | { kind: "jump"; to: Yard }
  /** The team with the ball changes here: the logo swaps. */
  | { kind: "possession"; side: Side }
  | { kind: "flash"; label: "Touchdown" | "Field goal" | "Safety" }
  /** The score counts up to this. The last score step of a play is always the feed's own score after it. */
  | { kind: "score"; home: number; away: number };

/** Where the ball rests once a play is over. */
export interface Rest {
  /** Null when nothing says where the ball is, such as a touchdown with no kickoff logged yet. */
  spot: Yard | null;
  /** The team with the ball next: the receiving team after a kick, the scoring team (to kick off) after a score. */
  side: Side | null;
  /** The next snap's down, 1–4, and distance. Null when there is no down to show, such as before a kickoff. */
  down: number | null;
  distance: number | null;
}

export interface PlayDescription {
  /** The play's id in the feed. */
  id: string;
  /** Where the ball sits at the snap. Null when the feed gave no spot, and for a play that draws nothing. */
  start: Yard | null;
  /** The team with the ball at the snap: the offense, or the kicking team. Null when the feed named neither team. */
  side: Side | null;
  /** Empty for a play that draws nothing: a timeout or a period marker. */
  segments: Segment[];
  rest: Rest;
}

/** The two teams, by the ids the feed uses. */
export interface FieldTeams {
  homeTeamId: number;
  awayTeamId: number;
}

/**
 * The game header's next snap, for the newest play, which has no next play to
 * read its end from. `yardsToGoal` is measured from the team that snaps next.
 * `down` is null when the header has no down to give.
 */
export interface FieldHeader {
  down: number | null;
  distance: number | null;
  yardsToGoal: number | null;
}

/** Plays that draw nothing: the field holds the last real play's resting state. */
const MARKERS = /^(timeout|official timeout|end period|end of half|halftime|end of game|end of regulation)$/i;
/** Markers after which nobody has the ball, so the Live Board hides its football. */
const BREAKS = /^(end period|end of half|halftime|end of game|end of regulation)$/i;

/** How far the schematic throw goes when an incompletion names no spot, like a spike. */
const SCHEMATIC_THROW = 12;
/** How deep into the end zone a touchback lands. */
const TOUCHBACK_DEPTH = 5;
/** How deep into the end zone a safety is drawn when the words give no spot. */
const SAFETY_DEPTH = 2;
/** Where an extra point or a two-point try is snapped from, in yards from the goal line. */
const TRY_DISTANCE = 3;

const other = (side: Side): Side => (side === "home" ? "away" : "home");
/** +1 when `side` attacks towards 100. */
const direction = (side: Side): 1 | -1 => (side === "away" ? 1 : -1);
/** The goal line `side` attacks. */
const goalAttacked = (side: Side): Yard => (side === "away" ? 100 : 0);
/** The spot `yardsToGoal` yards short of the goal `side` attacks. */
const fromGoal = (side: Side, yardsToGoal: number): Yard => goalAttacked(side) - direction(side) * yardsToGoal;
/** The spot `yards` from `side`'s own goal line, as "CCU31" reads when CCU is `side`. */
const ownSpot = (side: Side, yards: number): Yard => (side === "away" ? yards : 100 - yards);

/** "CCU31": a team abbreviation, then the yard line in two digits. */
const SPOT = String.raw`([A-Z][A-Z&-]{0,6}?)(\d{2})(?!\d)`;
const re = (source: string, flags = "") => new RegExp(source.replaceAll("SPOT", SPOT), flags);

/**
 * The feed's team abbreviations ("CCU", "LIB"), matched to sides. The feed
 * never says which is which, so each play votes: a play whose text says how
 * far the ball went and where it ended ("for 3 yards gain to the CCU31", "punt
 * 49 yards to the LIB37") places that spot from its own start, and the spot's
 * yard line says whose half it is on. Midfield votes for nobody.
 */
export function abbreviations(plays: readonly CfbdLivePlay[], sideOf: (teamId: number) => Side | null) {
  const votes = new Map<string, { home: number; away: number }>();
  const moved = re(
    String.raw`\b(?:for (?:a )?(?:loss of )?(-?\d+) yards?(?: (gain|loss))?|for no gain|(?:kickoff|punt) (-?\d+) yards?) to the SPOT`,
    "gi",
  );
  for (const play of plays) {
    const side = sideOf(play.teamId);
    if (side === null || play.yardsToGoal === null) continue;
    for (const match of play.playText.split(/\bPENALTY\b/)[0].matchAll(moved)) {
      const [whole, runYards, gainOrLoss, kickYards, abbr, line] = match;
      const lost = gainOrLoss === "loss" || /loss of/.test(whole);
      const yards = Number(runYards ?? kickYards ?? 0);
      const end = fromGoal(side, play.yardsToGoal - (lost ? -Math.abs(yards) : yards));
      if (end < 0 || end > 100 || end === 50) continue;
      const owner =
        ownSpot("away", Number(line)) === end ? "away" : ownSpot("home", Number(line)) === end ? "home" : null;
      if (owner === null) continue;
      const tally = votes.get(abbr) ?? { home: 0, away: 0 };
      tally[owner]++;
      votes.set(abbr, tally);
    }
  }
  const sides = new Map<string, Side>();
  for (const [abbr, tally] of votes)
    if (tally.home !== tally.away) sides.set(abbr, tally.home > tally.away ? "home" : "away");
  // Two teams, two abbreviations: one placed names the other.
  const seen = new Set(plays.flatMap((play) => [...play.playText.matchAll(re(`\\bSPOT`, "g"))].map((m) => m[1])));
  if (seen.size === 2 && sides.size === 1) {
    const [[known, side]] = sides;
    for (const abbr of seen) if (abbr !== known) sides.set(abbr, other(side));
  }
  return sides;
}

/** Everything one play is described from. */
interface Context {
  play: CfbdLivePlay;
  side: Side;
  start: Yard | null;
  /** The start of the next real play, and who has the ball for it. Null for the newest play. */
  next: { spot: Yard | null; side: Side; down: number | null; distance: number | null; kickoff: boolean } | null;
  /** The game header's next snap. Only for the newest play that isn't a marker. */
  header: FieldHeader | null;
  /** The score before this play. */
  before: { home: number; away: number };
  spot: (text: string) => Yard | null;
  sideOfAbbr: (abbr: string) => Side | null;
}

/** What the play's own words say, before any fallback. */
interface Drawn {
  segments: Segment[];
  /** Where the ball stopped, or null when nothing parsed. */
  end: Yard | null;
  /** The team with the ball once the play is over. */
  holder: Side;
  /** A kick with no return: the ball is then placed wherever the feed says the next snap is. */
  placed: boolean;
  /** Anything drawn at all. False falls back to a jump. */
  recognised: boolean;
}

/**
 * Every play in the order the feed logged them, described. `header` is the
 * game header's next snap, for the newest play; pass it only when it came
 * from the same response as `plays`. Never throws: a play it cannot read is a
 * single jump to its end spot.
 */
export function describePlays(
  plays: readonly CfbdLivePlay[],
  teams: FieldTeams,
  header: FieldHeader | null = null,
): PlayDescription[] {
  const sideOf = (teamId: number): Side | null =>
    teamId === teams.homeTeamId ? "home" : teamId === teams.awayTeamId ? "away" : null;
  const abbrs = abbreviations(plays, sideOf);
  const sideOfAbbr = (abbr: string) => abbrs.get(abbr) ?? null;
  const spot = (text: string): Yard | null => {
    const match = text.match(re(`^SPOT$`));
    const side = match && sideOfAbbr(match[1]);
    return side ? ownSpot(side, Number(match[2])) : null;
  };

  // The header follows the newest real play: a timeout or a period's end after it only repeats its spot.
  const newest = plays.findLastIndex((play) => !MARKERS.test(play.playType));
  const out: PlayDescription[] = [];
  let held: Rest = { spot: null, side: null, down: null, distance: null };
  plays.forEach((play, i) => {
    const side = sideOf(play.teamId);
    const before = i === 0 ? { home: 0, away: 0 } : { home: plays[i - 1].homeScore, away: plays[i - 1].awayScore };
    if (MARKERS.test(play.playType) || side === null) {
      out.push({ id: play.id, start: held.spot, side: held.side, segments: [], rest: held });
      return;
    }
    const start = play.yardsToGoal === null ? held.spot : fromGoal(side, play.yardsToGoal);
    const following = plays.slice(i + 1).find((p) => !MARKERS.test(p.playType));
    const nextSide = following ? sideOf(following.teamId) : null;
    const next =
      following && nextSide
        ? {
            spot: following.yardsToGoal === null ? null : fromGoal(nextSide, following.yardsToGoal),
            side: nextSide,
            down: following.down !== null && following.down >= 1 && following.down <= 4 ? following.down : null,
            distance: following.distance,
            kickoff: /kickoff/i.test(following.playType) || /\bkickoff\b/.test(following.playText),
          }
        : null;
    const ctx: Context = { play, side, start, next, header: i === newest ? header : null, before, spot, sideOfAbbr };
    let description: PlayDescription;
    try {
      description = describe(ctx);
    } catch {
      description = fallback(ctx);
    }
    out.push(description);
    held = description.rest;
  });
  return out;
}

/**
 * The newest play's team with the ball, for the Live Board's football. Null
 * at a break (a period's end, halftime, the final), and when there is no play.
 */
export function ballSide(plays: readonly CfbdLivePlay[], teams: FieldTeams, header: FieldHeader | null): Side | null {
  const newest = plays.at(-1);
  if (!newest || BREAKS.test(newest.playType)) return null;
  return describePlays(plays, teams, header).at(-1)?.rest.side ?? null;
}

/** The end spot when the words give none: the next play's start, else the header's. */
function fallbackSpot(ctx: Context, holder: Side): Yard | null {
  if (ctx.next) return ctx.next.spot;
  if (ctx.header?.yardsToGoal != null) return fromGoal(holder, ctx.header.yardsToGoal);
  return null;
}

/** The next snap's down and distance: the next play's, or the header's for the newest. None before a kickoff. */
function nextDown(ctx: Context): Pick<Rest, "down" | "distance"> {
  if (ctx.next)
    return ctx.next.kickoff
      ? { down: null, distance: null }
      : { down: ctx.next.down, distance: ctx.next.down === null ? null : ctx.next.distance };
  if (ctx.header) return { down: ctx.header.down, distance: ctx.header.down === null ? null : ctx.header.distance };
  return { down: null, distance: null };
}

/** A play the words don't cover: one jump to wherever the ball ends up. */
function fallback(ctx: Context): PlayDescription {
  const holder = ctx.next?.side ?? ctx.side;
  const end = fallbackSpot(ctx, holder);
  return {
    id: ctx.play.id,
    start: ctx.start,
    side: ctx.side,
    segments: end === null || end === ctx.start ? [] : [{ kind: "jump", to: end }],
    rest: { spot: end ?? ctx.start, side: holder, ...nextDown(ctx) },
  };
}

function describe(ctx: Context): PlayDescription {
  const { play, side, start } = ctx;
  const text = play.playText;
  const [snap, ...penaltyClauses] = text.split(/\bPENALTY\b/);
  const penalties = penaltyClauses.flatMap((clause) => enforced(clause, ctx));

  if (/\bNO PLAY\b/.test(text)) {
    if (penalties.length === 0) return fallback(ctx);
    const last = penalties.at(-1) as Extract<Segment, { kind: "penalty" }>;
    return {
      id: play.id,
      start,
      side,
      segments: penalties,
      rest: { spot: last.to, side: ctx.next?.side ?? side, ...nextDown(ctx) },
    };
  }

  const drawn = start === null ? null : drawSnap(snap, ctx, start);
  if (drawn === null || !drawn.recognised) return fallback(ctx);
  const segments = [...drawn.segments];
  let holder = drawn.holder;
  let end = drawn.end;
  let score = ctx.before;
  const final = { home: play.homeScore, away: play.awayScore };
  const scorer: Side | null = final.home > ctx.before.home ? "home" : final.away > ctx.before.away ? "away" : null;
  let scored = false;

  if (/\bTOUCHDOWN\b/.test(text) && scorer) {
    scored = true;
    holder = scorer;
    score = { ...score, [scorer]: score[scorer] + 6 };
    segments.push({ kind: "flash", label: "Touchdown" }, { kind: "score", ...score });
    const tee = goalAttacked(scorer) - direction(scorer) * TRY_DISTANCE;
    const posts = goalAttacked(scorer) + direction(scorer) * 10;
    const kick = text.match(/kick attempt (good|failed|missed|no good|blocked)/i);
    const two = text.match(/two[- ]point|2[- ]point|2pt/i);
    if (kick) {
      segments.push({ kind: "arc", from: tee, to: posts });
      if (!/good/i.test(kick[1]) || /no good/i.test(kick[1])) segments.push({ kind: "miss", at: posts });
    } else if (two) {
      segments.push({ kind: "ground", from: tee, to: goalAttacked(scorer) });
    }
  } else if (/\bSAFETY\b/i.test(text) && scorer) {
    scored = true;
    holder = other(scorer);
    segments.push({ kind: "flash", label: "Safety" });
  } else if (/field goal/i.test(snap) && scorer) {
    scored = true;
    holder = scorer;
    segments.push({ kind: "flash", label: "Field goal" });
  }
  if (score.home !== final.home || score.away !== final.away) segments.push({ kind: "score", ...final });

  segments.push(...penalties);
  const lastPenalty = penalties.at(-1) as Extract<Segment, { kind: "penalty" }> | undefined;
  if (lastPenalty) end = lastPenalty.to;

  if (/TURNOVER ON DOWNS/i.test(text)) {
    holder = other(side);
    segments.push({ kind: "possession", side: holder });
  }

  // An older play's holder is confirmed by who snaps next; a turnover the words missed is still a swap.
  // A kickoff confirms nothing: it follows a score, or opens a half with the ball going to whoever chose it.
  if (ctx.next && !ctx.next.kickoff && ctx.next.side !== holder) {
    holder = ctx.next.side;
    if (!scored) segments.push({ kind: "possession", side: holder });
  }

  let spot: Yard | null;
  if (scored) {
    spot = ctx.next?.spot ?? null;
  } else if (drawn.placed) {
    spot = fallbackSpot(ctx, holder) ?? end;
    if (spot !== null && spot !== end) segments.push({ kind: "jump", to: spot });
  } else {
    spot = end ?? fallbackSpot(ctx, holder);
  }
  return {
    id: play.id,
    start,
    side,
    segments,
    rest: { spot, side: holder, ...(scored ? { down: null, distance: null } : nextDown(ctx)) },
  };
}

/** A penalty clause that moved the ball: the flag and the slide. Declined and offsetting penalties move nothing. */
function enforced(clause: string, ctx: Context): Segment[] {
  if (/\bdeclined\b|off-?setting/i.test(clause)) return [];
  const match = clause.match(re(`\\d+ yards? from SPOT to SPOT`));
  if (!match) return [];
  const from = ctx.spot(match[1] + match[2]);
  const to = ctx.spot(match[3] + match[4]);
  return from === null || to === null ? [] : [{ kind: "penalty", flag: from, from, to }];
}

/** The first spot `pattern` captures in `text`, placed on the field. */
function spotIn(text: string, pattern: string, ctx: Context): Yard | null {
  const match = text.match(re(pattern, "i"));
  return match ? ctx.spot(match[1] + match[2]) : null;
}

/** The snap itself, before any penalty on it: its flights, its swaps, and where the ball stopped. */
function drawSnap(snap: string, ctx: Context, start: Yard): Drawn {
  const { side } = ctx;
  const segments: Segment[] = [];
  const done = (end: Yard | null, holder = side, placed = false): Drawn => ({
    segments,
    end,
    holder,
    placed,
    recognised: true,
  });

  const kick = snap.match(re(String.raw`\b(kickoff|punt) -?\d+ yards? to the SPOT`, "i"));
  if (kick) {
    const receiver = other(side);
    let landing = ctx.spot(kick[2] + kick[3]);
    if (landing === null) return { segments, end: null, holder: receiver, placed: false, recognised: false };
    if (/touchback/i.test(snap)) landing = goalAttacked(side) + direction(side) * TOUCHBACK_DEPTH;
    segments.push({ kind: "arc", from: start, to: landing });
    const recovered = snap.match(/recovered by ([A-Z][A-Z&-]{0,6})\b/);
    const holder = recovered && ctx.sideOfAbbr(recovered[1]) === side ? side : receiver;
    if (holder !== side) segments.push({ kind: "possession", side: holder });
    const back = spotIn(snap.slice(kick.index! + kick[0].length), String.raw`return -?\d+ yards? to the SPOT`, ctx);
    if (back !== null) {
      segments.push({ kind: "ground", from: landing, to: back });
      return done(back, holder);
    }
    return done(landing, holder, true);
  }

  if (/field goal/i.test(snap)) {
    const posts = goalAttacked(side) + direction(side) * 10;
    if (/\bGOOD\b/.test(snap) && !/NO GOOD/i.test(snap)) {
      segments.push({ kind: "arc", from: start, to: posts });
      return done(posts);
    }
    // A miss or a block, unseen so far: short of the posts, with the X.
    const short = goalAttacked(side);
    segments.push(
      { kind: "arc", from: start, to: short },
      { kind: "miss", at: short },
      { kind: "possession", side: other(side) },
    );
    return done(null, other(side));
  }

  if (/\bintercepted\b/i.test(snap)) {
    const at = spotIn(snap, String.raw`intercepted\b.*?\bat SPOT`, ctx);
    const back = spotIn(snap, String.raw`return -?\d+ yards? to the SPOT`, ctx);
    const caught = at ?? back;
    if (caught === null) return { segments, end: null, holder: other(side), placed: false, recognised: false };
    segments.push({ kind: "arc", from: start, to: caught }, { kind: "possession", side: other(side) });
    if (back !== null && back !== caught) segments.push({ kind: "ground", from: caught, to: back });
    return done(back ?? caught, other(side));
  }

  const endOf =
    spotIn(snap, String.raw`\bto the SPOT`, ctx) ?? spotIn(snap, String.raw`\bKneel down\b.*?\bat SPOT`, ctx);

  if (/\bpass incomplete\b/i.test(snap)) {
    const thrown = spotIn(snap, String.raw`thrown to SPOT`, ctx) ?? start + direction(side) * SCHEMATIC_THROW;
    segments.push({ kind: "arc", from: start, to: thrown }, { kind: "miss", at: thrown }, { kind: "jump", to: start });
    return done(start);
  }

  let end: Yard | null;
  if (endOf === null && /\bSAFETY\b/.test(snap)) {
    // Brought down in the offense's own end zone, with no spot in the words.
    end = goalAttacked(other(side)) - direction(side) * SAFETY_DEPTH;
  } else if (/\bpass complete\b/i.test(snap)) {
    if (endOf === null) return { segments, end: null, holder: side, placed: false, recognised: false };
    const caught = spotIn(snap, String.raw`caught at SPOT`, ctx);
    if (caught !== null && caught !== endOf)
      segments.push({ kind: "arc", from: start, to: caught }, { kind: "ground", from: caught, to: endOf });
    else segments.push({ kind: "arc", from: start, to: endOf });
    end = endOf;
  } else if (/\b(rush|sacked|kneel down|scramble|run)\b/i.test(snap) && endOf !== null) {
    end = endOf;
  } else {
    return { segments, end: null, holder: side, placed: false, recognised: false };
  }

  if (!/\bfumbled?\b/i.test(snap)) {
    if (segments.length === 0) segments.push({ kind: "ground", from: start, to: end });
    return done(end);
  }

  // A fumble: the line runs to where the ball came out, then any swap and return.
  const loose = spotIn(snap, String.raw`fumbled? by (?:(?!recovered).)*? at SPOT`, ctx) ?? end;
  if (segments.length === 0) segments.push({ kind: "ground", from: start, to: loose });
  const recovered = snap.match(/recovered by ([A-Z][A-Z&-]{0,6})\b/);
  const holder = recovered ? (ctx.sideOfAbbr(recovered[1]) ?? side) : side;
  if (holder === side) return done(end);
  segments.push({ kind: "possession", side: holder });
  const after = snap.slice(snap.search(/recovered by/));
  const back =
    spotIn(after, String.raw`return -?\d+ yards? to the SPOT`, ctx) ??
    spotIn(after, String.raw`recovered by [^,]*? at SPOT`, ctx);
  if (back !== null && back !== loose) segments.push({ kind: "ground", from: loose, to: back });
  return done(back ?? loose, holder);
}
