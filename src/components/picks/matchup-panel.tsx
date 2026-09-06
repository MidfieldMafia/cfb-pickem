import { CAPS_LABEL as LABEL } from "@/components/section-label";
import { matchupColors } from "@/lib/matchup-colors";
import type { MatchupDetail } from "./types";

const ROW = "grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-x-2 text-[13px] tabular-nums";

/** The form comparison, in the order the panel stacks the bars. */
const STATS = [
  { key: "pointsFor", label: "Points / game", lowerBetter: false },
  { key: "pointsAgainst", label: "Points allowed", lowerBetter: true },
  { key: "yardsFor", label: "Yards / game", lowerBetter: false },
  { key: "yardsAgainst", label: "Yards allowed", lowerBetter: true },
] as const;

/** Splits "Georgia −6.5" into what each side of the spread row shows. */
function spreadSides(spread: string, away: string): [string, string] {
  if (spread === "Pick" || spread === "PK") return ["PK", "PK"];
  const favorite = spread.replace(/\s[−+-].*$/, "");
  const line = spread.slice(favorite.length).trim();
  const underdog = `+${line.replace(/^[−-]/, "")}`;
  return favorite === away ? [line, underdog] : [underdog, line];
}

function SplitBar({
  awayShare,
  colors,
  label,
  className = "h-1.5",
}: {
  awayShare: number;
  colors: [string, string];
  label: string;
  className?: string;
}) {
  return (
    <span role="img" aria-label={label} className={`flex gap-[3px] overflow-hidden rounded-full bg-border ${className}`}>
      <span style={{ width: `${awayShare}%`, background: colors[0] }} />
      <span className="flex-1" style={{ background: colors[1] }} />
    </span>
  );
}

function StatBar({
  awayTeam,
  homeTeam,
  label,
  away,
  home,
  lowerBetter = false,
}: {
  awayTeam: string;
  homeTeam: string;
  label: string;
  /** Null before a team's first game or for an FCS opponent: the side shows a dash and the bar splits evenly. */
  away: number | null;
  home: number | null;
  lowerBetter?: boolean;
}) {
  const known = away !== null && home !== null;
  const total = known ? away + home || 1 : 1;
  const awayBetter = known && (lowerBetter ? away < home : away > home);
  const homeBetter = known && (lowerBetter ? home < away : home > away);
  const strong = "font-extrabold text-foreground";
  const weak = "font-medium text-muted-foreground";
  return (
    <div className={ROW}>
      <span className={awayBetter ? strong : weak}>{away ?? "–"}</span>
      <span className="grid gap-[3px]">
        <span className={`${LABEL} text-center text-[10px] leading-3`}>{label}</span>
        <SplitBar
          awayShare={known ? Math.round((away / total) * 100) : 50}
          colors={matchupColors(awayTeam, homeTeam)}
          label={`${label}: ${awayTeam} ${away ?? "unknown"}, ${homeTeam} ${home ?? "unknown"}`}
        />
      </span>
      <span className={`text-right ${homeBetter ? strong : weak}`}>{home ?? "–"}</span>
    </div>
  );
}

/**
 * The comparison above the team tiles. Deliberately flat on the paper with no
 * card border, so it cannot be mistaken for a tap target.
 *
 * Takes primitives rather than a wire type so it drops into any caller holding
 * a slate: PickFlow passes `game.awayTeam`, `game.homeTeam`, `game.spread`.
 */
export function MatchupPanel({
  awayTeam,
  homeTeam,
  spread,
  detail,
}: {
  awayTeam: string;
  homeTeam: string;
  spread: string | null;
  detail: MatchupDetail | null;
}) {
  const sides = spread ? spreadSides(spread, awayTeam) : null;
  const favored = (side: string) => side.startsWith("−") || side.startsWith("-");
  const homeWin = detail?.homeWp == null ? null : Math.round(detail.homeWp * 100);

  if (!sides && !detail) return null;

  return (
    <div className="grid gap-2 px-1 pt-1.5 pb-2.5">
      {sides ? (
        <div className={ROW}>
          <span className={favored(sides[0]) ? "font-extrabold text-foreground" : "font-medium text-muted-foreground"}>
            {sides[0]}
          </span>
          <span className={`${LABEL} text-center text-[10px] leading-3`}>Spread</span>
          <span
            className={`text-right ${favored(sides[1]) ? "font-extrabold text-foreground" : "font-medium text-muted-foreground"}`}
          >
            {sides[1]}
          </span>
        </div>
      ) : null}

      {detail ? (
        <div className="grid gap-1.5">
          {STATS.map(({ key, label, lowerBetter }) => (
            <StatBar
              key={key}
              awayTeam={awayTeam}
              homeTeam={homeTeam}
              label={label}
              away={detail.away[key]}
              home={detail.home[key]}
              lowerBetter={lowerBetter}
            />
          ))}
        </div>
      ) : null}

      {homeWin === null ? null : (
        <div className="grid gap-1">
          <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
            <b className="text-foreground">{100 - homeWin}%</b>
            <span className={`${LABEL} text-[11px]`}>Win probability</span>
            <b className="text-foreground">{homeWin}%</b>
          </div>
          <SplitBar
            awayShare={100 - homeWin}
            colors={matchupColors(awayTeam, homeTeam)}
            label={`${awayTeam} ${100 - homeWin}%, ${homeTeam} ${homeWin}%`}
            className="h-2"
          />
        </div>
      )}
    </div>
  );
}
