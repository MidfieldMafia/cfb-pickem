"use client";

import { LocalTime } from "@/components/local-time";
import { groupByKickoff, windowLabel } from "@/components/picks/kickoff-groups";
import { MatchupPanel } from "@/components/picks/matchup-panel";
import { TeamTile } from "@/components/picks/team-tile";
import { WeatherPill } from "@/components/picks/weather-pill";
import { gameDetail, week1 } from "@/lib/scoring/fixtures/week-1-2026";

/**
 * A harness for the pick-screen design components, rendered from the Week 1
 * fixture. It exists so they can be reviewed before PickFlow adopts them and
 * before #32 supplies real stats; delete it once both have happened.
 */
const games = week1.games
  .filter((game) => !game.void)
  .map((game) => {
    const detail = gameDetail(game.id)!;
    return { game, detail, kickoff: detail.kickoff };
  });

export default function PickComponentPreview() {
  const noop = () => {};
  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <h1 className="pb-1">Pick screen components</h1>
      <p className="pb-4 text-sm text-muted-foreground">
        Week 1 fixture. Not the pick flow — these are the pieces PickFlow consumes.
      </p>

      {games.slice(0, 2).map(({ game, detail }, index) => (
        <section key={game.id} className="mb-8">
          <div className="flex min-h-6 items-center gap-2 pb-1">
            <span className="grid min-w-0 flex-1 text-sm leading-[18px] text-muted-foreground">
              <span>
                <LocalTime at={detail.kickoff} style="slot" />
                {detail.tv ? ` · ${detail.tv}` : ""}
              </span>
              <span className="truncate text-xs">
                {detail.venue} · {detail.city}
              </span>
            </span>
            {detail.weather ? <WeatherPill weather={detail.weather} /> : null}
          </div>

          <MatchupPanel
            awayTeam={game.awayTeam}
            homeTeam={game.homeTeam}
            spread={detail.spread}
            // The second card shows the pre-#32 state: spread only, no bars.
            detail={index === 0 ? { homeWp: detail.homeWp, weather: detail.weather, home: detail.home, away: detail.away } : null}
          />

          <div className="flex h-64 items-stretch gap-1.5">
            <TeamTile
              name={game.awayTeam}
              rank={detail.away.rank}
              record={index === 0 ? detail.away.record : null}
              side="away"
              picked={index === 0}
              dimmed={false}
              onPick={noop}
            />
            <span className="w-6 shrink-0 self-center text-center text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
              at
            </span>
            <TeamTile
              name={game.homeTeam}
              rank={detail.home.rank}
              record={index === 0 ? detail.home.record : null}
              side="home"
              picked={false}
              dimmed={index === 0}
              onPick={noop}
            />
          </div>
        </section>
      ))}

      <h2 className="pb-2">Kickoff windows</h2>
      {groupByKickoff(games).map(({ kickoff, games: inWindow }) => (
        <div key={kickoff} className="flex items-baseline gap-2 pb-1">
          <span className="text-xs font-bold uppercase tracking-[0.08em] text-secondary">{windowLabel(kickoff)}</span>
          <span className="text-xs text-muted-foreground">
            <LocalTime at={kickoff} style="slot" />
          </span>
          <span className="text-xs text-muted-foreground">
            · {inWindow.length} game{inWindow.length === 1 ? "" : "s"}
          </span>
        </div>
      ))}
    </main>
  );
}
