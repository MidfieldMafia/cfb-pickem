/**
 * A final game's box score for the Game sheet: the seven team-stat rows and
 * the five game leaders drawn on #265, read out of CFBD's `/games/teams` and
 * `/games/players` for one game. Pure and free of database imports; the
 * fetch, the roster and the storing are `./box-scores`.
 *
 * The feed's shape and traps (stats as strings, missing zero categories, the
 * " Team" pseudo-player, ties, sides with no sacks) are in
 * docs/research/cfbd-final-game-stats.md.
 */
import type { CfbdAthleteStat, CfbdGamePlayerStatsSide, CfbdGameTeamStatsSide } from "@/lib/cfbd/types";
import type { BarColors } from "./bar-colors";

export type TeamStatKey =
  | "totalYards"
  | "turnovers"
  | "firstDowns"
  | "penalties"
  | "thirdDown"
  | "fourthDown"
  | "possession";

/** One side of a team-stat row. */
export interface TeamStatValue {
  /** As the sheet shows it: "356", "6-55", "4/12", "27:10". */
  display: string;
  /**
   * What the split bar is sized by: the count for yards, turnovers and first
   * downs; penalty **yards**; the conversion **rate** (0–1) for 3rd and 4th
   * down, 0 with no attempts; possession in **seconds**.
   */
  value: number;
}

export interface TeamStatRow {
  key: TeamStatKey;
  label: string;
  away: TeamStatValue;
  home: TeamStatValue;
}

export type LeaderKey = "passing" | "rushing" | "receiving" | "sacks" | "tackles";

export interface Leader {
  /** CFBD's athlete id. */
  playerId: string;
  /** The one name shown, as the feed gives it: "Julian Sayin". */
  name: string;
  /** From the season's roster. Null when the roster has none, or only "?": omit it, never show "?". */
  position: string | null;
  /** The figure in the centre column: "278", "0.5". */
  value: string;
  /** The line under the name: "22/34, 1 TD", "14 car", "6 rec, 1 TD", "6 solo". Null for sacks, which have none. */
  detail: string | null;
}

export interface LeaderRow {
  key: LeaderKey;
  label: string;
  /** Null when that side has nobody to show: no sacks, say, or nobody who carried the ball. */
  away: Leader | null;
  home: Leader | null;
}

/** What is stored for a final game, once, when CFBD first has both halves of it. */
export interface BoxScore {
  teamStats: TeamStatRow[];
  leaders: LeaderRow[];
}

/** What the Game sheet is served: the stored box score, with the bar colours worked out on the way. */
export interface FinalStats extends BoxScore {
  colors: BarColors;
}

/** The season's positions by athlete id, with null and "?" already left out. */
export type Positions = Readonly<Record<string, string>>;

/**
 * How much of a row's split bar is away's: its value over both, the way the
 * canvas sizes it whichever side a higher number favours. Two zeroes (no
 * 4th-down tries, say) split evenly.
 */
export function awayShare({ away, home }: TeamStatRow): number {
  const total = away.value + home.value;
  return total > 0 ? away.value / total : 0.5;
}

/** A roster position worth showing: null and CFBD's literal "?" are not. */
export function shownPosition(position: string | null | undefined): string | null {
  const trimmed = position?.trim();
  return trimmed && trimmed !== "?" ? trimmed : null;
}

/** Both sides of one game, as the two endpoints give them. */
export interface GameStatsSides {
  teams: CfbdGameTeamStatsSide[];
  players: CfbdGamePlayerStatsSide[];
}

/**
 * The box score, or null when either endpoint lacks a side: the sides are
 * matched by `homeAway` (the player stats carry no team id), so a response
 * missing one is not a box score yet.
 */
export function toBoxScore({ teams, players }: GameStatsSides, positions: Positions): BoxScore | null {
  const side = <T extends { homeAway: string }>(list: T[], homeAway: "home" | "away") =>
    list.find((s) => s.homeAway === homeAway);
  const awayTeam = side(teams, "away");
  const homeTeam = side(teams, "home");
  const awayPlayers = side(players, "away");
  const homePlayers = side(players, "home");
  if (!awayTeam || !homeTeam || !awayPlayers || !homePlayers) return null;
  return {
    teamStats: TEAM_STATS.map(({ key, label, category, read }) => ({
      key,
      label,
      away: read(statOf(awayTeam, category)),
      home: read(statOf(homeTeam, category)),
    })),
    leaders: LEADERS.map((spec) => ({
      key: spec.key,
      label: spec.label,
      away: leaderOf(awayPlayers, spec, positions),
      home: leaderOf(homePlayers, spec, positions),
    })),
  };
}

/** A team stat's string, or null when CFBD left the category out, which it does for one that came to zero. */
function statOf(side: CfbdGameTeamStatsSide, category: string): string | null {
  return side.stats.find((s) => s.category === category)?.stat ?? null;
}

const whole = (n: number) => (Number.isFinite(n) ? n : 0);

function count(stat: string | null): TeamStatValue {
  const value = whole(parseInt(stat ?? "0", 10));
  return { display: String(value), value };
}

/** "6-55": the count and the yards. */
function penalties(stat: string | null): TeamStatValue {
  const [n, yards] = (stat ?? "0-0").split("-").map((part) => whole(parseInt(part, 10)));
  return { display: `${n}-${yards ?? 0}`, value: yards ?? 0 };
}

/** "7-12", shown "7/12" as the canvas has it. */
function conversions(stat: string | null): TeamStatValue {
  const [made, attempts] = (stat ?? "0-0").split("-").map((part) => whole(parseInt(part, 10)));
  const att = attempts ?? 0;
  return { display: `${made}/${att}`, value: att > 0 ? made / att : 0 };
}

/** "28:41" in minutes and seconds. */
function possession(stat: string | null): TeamStatValue {
  const match = stat?.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { display: "0:00", value: 0 };
  return { display: stat!, value: Number(match[1]) * 60 + Number(match[2]) };
}

const TEAM_STATS: { key: TeamStatKey; label: string; category: string; read: (stat: string | null) => TeamStatValue }[] =
  [
    { key: "totalYards", label: "Total yards", category: "totalYards", read: count },
    { key: "turnovers", label: "Turnovers", category: "turnovers", read: count },
    { key: "firstDowns", label: "1st downs", category: "firstDowns", read: count },
    { key: "penalties", label: "Penalties", category: "totalPenaltiesYards", read: penalties },
    { key: "thirdDown", label: "3rd down", category: "thirdDownEff", read: conversions },
    { key: "fourthDown", label: "4th down", category: "fourthDownEff", read: conversions },
    { key: "possession", label: "Possession", category: "possessionTime", read: possession },
  ];

/** One athlete's figures across a category's types: "YDS" → "278", "C/ATT" → "21/29". */
type Line = { id: string; name: string } & Record<string, string>;

interface LeaderSpec {
  key: LeaderKey;
  label: string;
  category: string;
  /** The type the leader is ranked by. */
  rank: string;
  /**
   * Ties on `rank` go to the higher of these, in turn, and then to the name
   * that sorts first. Ties are the rule for sacks and common for tackles.
   */
  tiebreaks: ((line: Line) => number)[];
  /** Nobody leads a side whose best is zero: nobody sacked anyone. */
  zeroIsNobody: boolean;
  detail: (line: Line) => string | null;
}

const num = (s: string | undefined) => whole(parseFloat(s ?? "0"));
const type = (name: string) => (line: Line) => num(line[name]);
/** "21/29" → 21. */
const completions = (line: Line) => num(line["C/ATT"]?.split("/")[0]);
const touchdowns = (line: Line) => (num(line.TD) > 0 ? `, ${num(line.TD)} TD` : "");

const LEADERS: LeaderSpec[] = [
  {
    key: "passing",
    label: "Passing yards",
    category: "passing",
    rank: "YDS",
    tiebreaks: [type("TD"), completions],
    zeroIsNobody: false,
    detail: (line) => `${line["C/ATT"] ?? "0/0"}${touchdowns(line)}${num(line.INT) > 0 ? `, ${num(line.INT)} INT` : ""}`,
  },
  {
    key: "rushing",
    label: "Rushing yards",
    category: "rushing",
    rank: "YDS",
    tiebreaks: [type("TD"), type("CAR")],
    zeroIsNobody: false,
    detail: (line) => `${num(line.CAR)} car${touchdowns(line)}`,
  },
  {
    key: "receiving",
    label: "Receiving yards",
    category: "receiving",
    rank: "YDS",
    tiebreaks: [type("TD"), type("REC")],
    zeroIsNobody: false,
    detail: (line) => `${num(line.REC)} rec${touchdowns(line)}`,
  },
  {
    key: "sacks",
    label: "Sacks",
    category: "defensive",
    rank: "SACKS",
    tiebreaks: [type("TD"), type("TFL"), type("TOT")],
    zeroIsNobody: true,
    detail: () => null,
  },
  {
    key: "tackles",
    label: "Tackles",
    category: "defensive",
    rank: "TOT",
    tiebreaks: [type("TD"), type("SOLO")],
    zeroIsNobody: true,
    detail: (line) => `${num(line.SOLO)} solo`,
  },
];

/**
 * Each real athlete in a category, with every type's figure on one line. The
 * " Team" pseudo-player (a negative id) is dropped: it is not a person, and
 * the roster has no position for it.
 */
function linesOf(side: CfbdGamePlayerStatsSide, category: string): Line[] {
  const types = side.categories.find((c) => c.name === category)?.types ?? [];
  const byId = new Map<string, Line>();
  for (const { name, athletes } of types) {
    for (const athlete of athletes.filter(isPlayer)) {
      const line = byId.get(athlete.id) ?? ({ id: athlete.id, name: athlete.name.trim() } as Line);
      line[name] = athlete.stat;
      byId.set(athlete.id, line);
    }
  }
  return [...byId.values()];
}

function isPlayer(athlete: CfbdAthleteStat): boolean {
  return !athlete.id.startsWith("-");
}

function leaderOf(side: CfbdGamePlayerStatsSide, spec: LeaderSpec, positions: Positions): Leader | null {
  const ranked = linesOf(side, spec.category)
    .filter((line) => line[spec.rank] !== undefined)
    .sort((a, b) => {
      for (const by of [type(spec.rank), ...spec.tiebreaks]) {
        const diff = by(b) - by(a);
        if (diff !== 0) return diff;
      }
      return a.name.localeCompare(b.name, "en");
    });
  const best = ranked[0];
  if (!best || (spec.zeroIsNobody && num(best[spec.rank]) <= 0)) return null;
  return {
    playerId: best.id,
    name: best.name,
    position: shownPosition(positions[best.id]),
    value: best[spec.rank],
    detail: spec.detail(best),
  };
}
