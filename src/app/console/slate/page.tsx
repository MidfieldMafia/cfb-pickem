import Link from "next/link";
import { Check, X } from "lucide-react";
import { db } from "@/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocalTime } from "@/components/local-time";
import { SECTION_LABEL } from "@/components/section-label";
import { TeamLogo } from "@/components/team-logo";
import { TeamName } from "@/components/team-name";
import { cfbd } from "@/lib/cfbd";
import { weekCandidates, type CandidateGame } from "@/lib/cfbd/candidates";
import { requireConsole } from "@/lib/members/current";
import { MAX_NOTE } from "@/lib/notes";
import { plural } from "@/lib/plural";
import { isVoid, toGameView, toSlateCandidates, voidNote, type GameView } from "@/lib/slate/json";
import { activeSeason, openWeek, seasonWeeks, slateFor } from "@/lib/slate/slate";
import { ActionForm } from "../action-form";
import { pillClass } from "../pill";
import { requestedWeekNumber } from "../week-param";
import { filterParam, FILTERS, matches, type Filter } from "./candidate-filter";
import {
  addGameAction,
  refreshAction,
  removeGameAction,
  setTiebreakerAction,
  voidGameAction,
} from "./actions";
import { openMeteo } from "@/lib/weather/open-meteo";
import { CandidateCheckbox } from "./candidate-checkbox";
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
      <div>
        <h1>Slate builder</h1>
        <p className="text-sm text-muted-foreground">
          Week {weekNumber} ·{" "}
          {slate.week.published ? "published; voids and the deadline are the only edits" : "draft; edit freely until you publish"}
        </p>
      </div>

      {/* The slate rail takes the width it needs and no more; the candidates
          table gets the rest, because Spread is what a choice turns on and it
          was scrolling out of sight. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                <tr>
                  <th className="px-2 py-3">
                    <span className="sr-only">On the slate</span>
                  </th>
                  <th className="p-3">Game</th>
                  <th className="px-2 py-3">Kickoff</th>
                  <th className="px-2 py-3">TV</th>
                  <th className="px-2 py-3">Spread</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map(({ candidate: c, onSlate: picked }) => (
                  <tr key={c.cfbdGameId} className={picked ? "bg-muted" : ""}>
                    <td className="px-2 align-middle">
                      <form action={picked ? removeGameAction : addGameAction}>
                        <input type="hidden" name="weekId" value={week.id} />
                        {picked ? (
                          <input type="hidden" name="gameId" value={picked.id} />
                        ) : (
                          <input type="hidden" name="cfbdGameId" value={c.cfbdGameId} />
                        )}
                        <CandidateCheckbox
                          checked={Boolean(picked)}
                          // A published Slate takes neither an add nor a
                          // remove — `addGame` and `removeGame` both refuse —
                          // so the boxes say so rather than throwing when
                          // clicked.
                          disabled={slate.week.published}
                          label={`${c.awayTeam} at ${c.homeTeam} on the slate`}
                        />
                      </form>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <TeamLogo team={c.awayTeam} size={20} />
                        <TeamName name={c.awayTeam} rank={c.awayRank} />
                        <span className="font-sans font-normal text-muted-foreground">at</span>
                        <TeamLogo team={c.homeTeam} size={20} />
                        <TeamName name={c.homeTeam} rank={c.homeRank} />
                      </div>
                    </td>
                    {/* The date, not just the weekday: a week runs Tuesday to
                        Saturday and can cross a month, so "Sat 9:00 PM" above
                        "Thu 5:00 PM" reads as a sorting bug. */}
                    <td className="px-2 py-3 whitespace-nowrap text-muted-foreground">
                      {c.kickoffTbd ? "TBD · " : null}
                      <LocalTime at={c.kickoff} />
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap text-muted-foreground">{c.detail.tv ?? "TBD"}</td>
                    <td className="px-2 py-3 whitespace-nowrap text-muted-foreground">{c.spread ?? "No line yet"}</td>
                  </tr>
                ))}
                {shown.length === 0 && !feedError ? (
                  <tr>
                    <td colSpan={5} className="p-3 text-muted-foreground">
                      No games match.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
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
  const matchup = `${game.awayTeam} at ${game.homeTeam}`;
  return (
    <li className={`space-y-2 p-3 ${voided ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <TeamLogo team={game.awayTeam} size={18} />
            <TeamName name={game.awayTeam} rank={game.awayRank} className="text-sm" />
            <span className="text-sm text-muted-foreground">at</span>
            <TeamLogo team={game.homeTeam} size={18} />
            <TeamName name={game.homeTeam} rank={game.homeRank} className="text-sm" />
            {voided ? <Badge variant="outline">Void</Badge> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            <LocalTime at={game.kickoff} />
            {game.spread ? ` · ${game.spread}` : ""}
            {why ? ` · ${why}` : ""}
          </p>
        </div>
        {voided ? null : (
          <form action={setTiebreakerAction}>
            <input type="hidden" name="weekId" value={weekId} />
            <input type="hidden" name="gameId" value={game.id} />
            {/* The one Tiebreaker Game reads as a chosen-one-of-many mark, so
                it wears the rust ring the mockups draw rather than a word. */}
            <button
              type="submit"
              aria-pressed={tiebreaker}
              aria-label={`Tiebreaker Game: ${matchup}`}
              title={tiebreaker ? `Tiebreaker Game: ${matchup}` : `Make this the Tiebreaker Game`}
              className="flex size-tap items-center justify-center"
            >
              <span
                className={`grid size-5 place-items-center rounded-full border-2 ${
                  tiebreaker ? "border-secondary bg-secondary text-secondary-foreground" : "border-border"
                }`}
              >
                {tiebreaker ? <Check size={12} strokeWidth={4} aria-hidden /> : null}
              </span>
            </button>
          </form>
        )}
        {published ? null : (
          <form action={removeGameAction}>
            <input type="hidden" name="gameId" value={game.id} />
            <button
              type="submit"
              aria-label={`Remove ${matchup}`}
              title={`Remove ${matchup}`}
              className="flex size-tap items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
            >
              <X size={16} aria-hidden />
            </button>
          </form>
        )}
      </div>
      {/* Voiding is rare and needs a reason, so it stays folded away rather
          than standing a note box open on all ten rows all season. */}
      {published && !voided ? (
        <details>
          {/* Short on screen, whole matchup for a screen reader working down
              ten rows that would otherwise all say the same word. */}
          <summary aria-label={`Void ${matchup}`} className="w-fit cursor-pointer py-1 text-xs font-bold text-destructive">
            Void
          </summary>
          <ActionForm
            action={voidGameAction}
            hidden={{ gameId: game.id }}
            submit="Void"
            pendingLabel="Voiding…"
            variant="destructive"
            className="mt-1 space-y-2"
          >
            <Input
              name="note"
              required
              maxLength={MAX_NOTE}
              placeholder="Void note (why)"
              aria-label={`Void note for ${matchup}`}
              className="h-9"
            />
          </ActionForm>
        </details>
      ) : null}
    </li>
  );
}
