import { matchupColors } from "@/lib/matchup-colors";
import type { MatchupDetail } from "./types";

const LABEL = "font-bold uppercase tracking-[0.08em] text-secondary";
const ROW = "grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-x-2 text-[13px] tabular-nums";

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
  away: number;
  home: number;
  lowerBetter?: boolean;
}) {
  const total = away + home || 1;
  const awayBetter = lowerBetter ? away < home : away > home;
  return (
    <div className={ROW}>
      <span className={awayBetter ? "font-extrabold text-foreground" : "font-medium text-muted-foreground"}>{away}</span>
      <span className="grid gap-[3px]">
        <span className={`${LABEL} text-center text-[10px] leading-3`}>{label}</span>
        <SplitBar
          awayShare={Math.round((away / total) * 100)}
          colors={matchupColors(awayTeam, homeTeam)}
          label={`${label}: ${awayTeam} ${away}, ${homeTeam} ${home}`}
        />
      </span>
      <span
        className={`text-right ${awayBetter ? "font-medium text-muted-foreground" : "font-extrabold text-foreground"}`}
      >
        {home}
      </span>
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
          <StatBar
            awayTeam={awayTeam}
            homeTeam={homeTeam}
            label="Points / game"
            away={detail.away.pointsFor}
            home={detail.home.pointsFor}
          />
          <StatBar
            awayTeam={awayTeam}
            homeTeam={homeTeam}
            label="Points allowed"
            away={detail.away.pointsAgainst}
            home={detail.home.pointsAgainst}
            lowerBetter
          />
          <StatBar
            awayTeam={awayTeam}
            homeTeam={homeTeam}
            label="Yards / game"
            away={detail.away.yardsFor}
            home={detail.home.yardsFor}
          />
          <StatBar
            awayTeam={awayTeam}
            homeTeam={homeTeam}
            label="Yards allowed"
            away={detail.away.yardsAgainst}
            home={detail.home.yardsAgainst}
            lowerBetter
          />
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
