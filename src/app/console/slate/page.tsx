import Link from "next/link";
import { db } from "@/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocalTime } from "@/components/local-time";
import { SECTION_LABEL } from "@/components/section-label";
import { TeamName } from "@/components/team-name";
import { cfbd } from "@/lib/cfbd";
import { weekCandidates, type CandidateGame } from "@/lib/cfbd/candidates";
import { requireConsole } from "@/lib/members/current";
import { MAX_NOTE } from "@/lib/notes";
import { plural } from "@/lib/plural";
import { isVoid, toGameView, toSlateCandidates, voidNote, type GameView } from "@/lib/slate/json";
import { activeSeason, openWeek, seasonWeeks, slateFor, WEEK_NUMBERS } from "@/lib/slate/slate";
import { ActionForm } from "../action-form";
import { pillClass } from "../pill";
import { requestedWeekNumber } from "../week-param";
import { filterParam, FILTERS, matches, type Filter } from "./candidate-filter";
import {
  addGameAction,
  chooseWeekAction,
  refreshAction,
  removeGameAction,
  setTiebreakerAction,
  voidGameAction,
} from "./actions";
import { openMeteo } from "@/lib/weather/open-meteo";
import { DeadlineForm } from "./deadline-form";
import { PublishButton } from "./publish-button";

export default async function SlateBuilder({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; filter?: string; q?: string }>;
}) {
  const commissioner = await requireConsole();
  const params = await searchParams;
  const database = db();
  const season = await activeSeason(database);
  const existing = await seasonWeeks(database, season);
  const weekNumber = requestedWeekNumber(existing, params.week);
  const filter = filterParam(params.filter);
  const q = params.q?.trim() ?? "";

  // The feed is ten HTTP calls and does not depend on the week row, so it runs alongside it.
  const [{ week, slate }, feed] = await Promise.all([
    openWeek(database, commissioner, weekNumber, season).then(async (w) => ({
      week: w,
      slate: await slateFor(database, w.id),
    })),
    weekCandidates(cfbd(), { year: season.year, week: weekNumber }, openMeteo()).then(
      (games) => ({ games, error: null as string | null }),
      (error: unknown) => ({
        games: [] as CandidateGame[],
        error: error instanceof Error ? error.message : "CollegeFootballData did not answer.",
      }),
    ),
  ]);
  const candidates = feed.games;
  const feedError = feed.error;
  const slateGames = slate.games.map(toGameView);
  const shown = toSlateCandidates(
    candidates.filter((c) => matches(c, filter, q)),
    slate.games,
  );
  const tiebreaker = slateGames.find((g) => g.game.id === slate.week.tiebreakerGameId)?.game ?? null;
  const filterHref = (f: Filter) => {
    const p = new URLSearchParams({ week: String(weekNumber) });
    if (f !== "all") p.set("filter", f);
    if (q) p.set("q", q);
    return `/console/slate?${p}`;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Slate builder</h1>
          <p className="text-sm text-muted-foreground">
            {season.year} · Week {weekNumber} ·{" "}
            {slate.week.published ? "published; voids and the deadline are the only edits" : "draft; edit freely until you publish"}
          </p>
        </div>
        <form action={chooseWeekAction} className="flex items-center gap-2 text-sm font-semibold">
          Week
          <select
            name="weekNumber"
            defaultValue={weekNumber}
            className="h-11 rounded-md border border-input bg-card px-3 text-sm"
          >
            {WEEK_NUMBERS.map((n) => (
              <option key={n} value={n}>
                {n}
                {existing.find((w) => w.weekNumber === n)?.published ? " · published" : ""}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline">
            Go
          </Button>
        </form>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(20rem,2fr)]">
        <section className="rounded-md border border-border bg-card">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border p-3">
            <div>
              <h2>Game candidates</h2>
              <p className="text-sm text-muted-foreground">
                Week {weekNumber} from CollegeFootballData · {candidates.length} games · ranks from the latest poll
              </p>
            </div>
            <form method="get" action="/console/slate" className="flex gap-2">
              <input type="hidden" name="week" value={weekNumber} />
              {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
              <Input name="q" defaultValue={q} placeholder="Find a team" aria-label="Find a team" className="w-44" />
              <Button type="submit" variant="outline">
                Find
              </Button>
            </form>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
            {FILTERS.map((f) => (
              <Link key={f.key} href={filterHref(f.key)} className={pillClass(f.key === filter)}>
                {f.label}
              </Link>
            ))}
            <form action={refreshAction} className="ml-auto">
              <input type="hidden" name="weekId" value={week.id} />
              <Button type="submit" variant="ghost" size="sm">
                Refresh from feed
              </Button>
            </form>
          </div>
          {feedError ? (
            <p role="alert" className="p-3 text-sm font-semibold text-destructive">
              {feedError}
            </p>
          ) : null}
          <ul className="divide-y divide-border">
            {shown.map(({ candidate: c, onSlate: picked }) => (
              <li
                key={c.cfbdGameId}
                className={`grid gap-2 p-3 md:grid-cols-[auto_minmax(0,1fr)_11rem_9rem] md:items-center ${
                  picked ? "bg-muted" : ""
                }`}
              >
                <form action={picked ? removeGameAction : addGameAction}>
                  <input type="hidden" name="weekId" value={week.id} />
                  {picked ? (
                    <input type="hidden" name="gameId" value={picked.id} />
                  ) : (
                    <input type="hidden" name="cfbdGameId" value={c.cfbdGameId} />
                  )}
                  <Button
                    type="submit"
                    size="sm"
                    variant={picked ? "secondary" : "outline"}
                    disabled={Boolean(picked) && slate.week.published}
                    aria-label={picked ? `Remove ${c.awayTeam} at ${c.homeTeam}` : `Add ${c.awayTeam} at ${c.homeTeam}`}
                  >
                    {picked ? "On slate" : "Add"}
                  </Button>
                </form>
                <div>
                  <TeamName name={c.awayTeam} rank={c.awayRank} /> <span className="text-muted-foreground">at</span>{" "}
                  <TeamName name={c.homeTeam} rank={c.homeRank} />
                  <p className="text-xs text-muted-foreground">
                    {[c.awayConference, c.homeConference].filter(Boolean).join(" · ") || "Non-conference"}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {c.kickoffTbd ? "Time TBD · " : null}
                  <LocalTime at={c.kickoff} />
                </p>
                <p className="text-sm text-muted-foreground">{c.spread ?? "No line yet"}</p>
              </li>
            ))}
            {shown.length === 0 && !feedError ? (
              <li className="p-3 text-sm text-muted-foreground">No games match.</li>
            ) : null}
          </ul>
        </section>

        <aside className="space-y-6">
          <section className="rounded-md border border-border bg-card">
            <div className="flex items-start justify-between gap-3 border-b border-border p-3">
              <div>
                <h2>Week {weekNumber} slate</h2>
                <p className="text-sm text-muted-foreground">
                  {plural(slateGames.length, "game")} ·{" "}
                  {tiebreaker ? `Tiebreaker: ${tiebreaker.awayTeam} at ${tiebreaker.homeTeam}` : "flag a Tiebreaker Game"}
                </p>
              </div>
              {slate.week.published ? (
                <Badge className="bg-secondary text-secondary-foreground">Published</Badge>
              ) : (
                <Badge variant="outline">Draft</Badge>
              )}
            </div>
            <ul className="divide-y divide-border">
              {slateGames.map((view) => (
                <SlateRow
                  key={view.game.id}
                  view={view}
                  weekId={week.id}
                  published={slate.week.published}
                  tiebreaker={view.game.id === slate.week.tiebreakerGameId}
                />
              ))}
              {slateGames.length === 0 ? (
                <li className="p-3 text-sm text-muted-foreground">Add games from the candidates list.</li>
              ) : null}
            </ul>
          </section>

          <section className="space-y-3 rounded-md border border-border bg-card p-3">
            <p className={SECTION_LABEL}>Deadline</p>
            {slate.deadline ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {slate.week.published
                    ? "Frozen at publish. It can still move earlier, never later."
                    : "Defaults to the earliest kickoff. Move it earlier, never later."}
                </p>
                <p className="font-semibold">
                  <LocalTime at={slate.deadline} style="deadline" />
                </p>
                <DeadlineForm weekId={week.id} deadline={slate.deadline} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Set once the slate has a game.</p>
            )}
            {slate.week.published ? null : <PublishButton weekId={week.id} gameCount={slateGames.length} />}
          </section>
        </aside>
      </div>
    </div>
  );
}

function SlateRow({
  view,
  weekId,
  published,
  tiebreaker,
}: {
  view: GameView;
  weekId: number;
  published: boolean;
  tiebreaker: boolean;
}) {
  const { game } = view;
  const voided = isVoid(view);
  const why = voidNote(view);
  return (
    <li className={`space-y-2 p-3 ${voided ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-semibold">
            {game.awayTeam} at {game.homeTeam}
            {voided ? <Badge variant="outline" className="ml-2">Void</Badge> : null}
          </p>
          <p className="text-xs text-muted-foreground">
            <LocalTime at={game.kickoff} />
            {game.spread ? ` · ${game.spread}` : ""}
            {why ? ` · ${why}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {voided ? null : (
            <form action={setTiebreakerAction}>
              <input type="hidden" name="weekId" value={weekId} />
              <input type="hidden" name="gameId" value={game.id} />
              <Button
                type="submit"
                size="sm"
                variant={tiebreaker ? "secondary" : "ghost"}
                aria-pressed={tiebreaker}
                aria-label={`Tiebreaker: ${game.awayTeam} at ${game.homeTeam}`}
              >
                {tiebreaker ? "Tiebreaker" : "Set tiebreaker"}
              </Button>
            </form>
          )}
          {published ? null : (
            <form action={removeGameAction}>
              <input type="hidden" name="gameId" value={game.id} />
              <Button type="submit" size="sm" variant="ghost" aria-label={`Remove ${game.awayTeam} at ${game.homeTeam}`}>
                ✕
              </Button>
            </form>
          )}
        </div>
      </div>
      {published && !voided ? (
        <ActionForm
          action={voidGameAction}
          hidden={{ gameId: game.id }}
          submit="Void"
          pendingLabel="Voiding…"
          variant="destructive"
        >
          <Input
            name="note"
            required
            maxLength={MAX_NOTE}
            placeholder="Void note (why)"
            aria-label="Void note"
            className="h-9"
          />
        </ActionForm>
      ) : null}
    </li>
  );
}
