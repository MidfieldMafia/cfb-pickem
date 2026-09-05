import Link from "next/link";
import { db } from "@/db";
import type { Game } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocalTime } from "@/components/local-time";
import { cfbd } from "@/lib/cfbd";
import { weekCandidates, type CandidateGame } from "@/lib/cfbd/candidates";
import { requireConsole } from "@/lib/members/current";
import { activeSeason, openWeek, seasonWeeks, slateFor } from "@/lib/slate/slate";
import {
  addGameAction,
  chooseWeekAction,
  refreshAction,
  removeGameAction,
  setTiebreakerAction,
  voidGameAction,
} from "./actions";
import { DeadlineForm } from "./deadline-form";
import { PublishButton } from "./publish-button";

type Filter = "all" | "ranked" | "sec";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All FBS" },
  { key: "ranked", label: "Ranked" },
  { key: "sec", label: "SEC" },
];
const WEEK_NUMBERS = Array.from({ length: 15 }, (_, i) => i + 1);

function matches(c: CandidateGame, filter: Filter, q: string): boolean {
  if (filter === "ranked" && c.homeRank === null && c.awayRank === null) return false;
  if (filter === "sec" && c.homeConference !== "SEC" && c.awayConference !== "SEC") return false;
  if (q && !`${c.awayTeam} ${c.homeTeam}`.toLowerCase().includes(q.toLowerCase())) return false;
  return true;
}

function Team({ name, rank }: { name: string; rank: number | null }) {
  return (
    <span className="font-display font-black">
      {rank ? <span className="mr-1 text-xs font-bold text-muted-foreground">#{rank}</span> : null}
      {name}
    </span>
  );
}

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
  const requested = Number(params.week);
  const weekNumber = Number.isInteger(requested) && requested > 0 ? requested : existing.at(-1)?.weekNumber ?? 1;
  const week = await openWeek(database, commissioner, weekNumber);
  const slate = await slateFor(database, week.id);
  const filter: Filter = FILTERS.some((f) => f.key === params.filter) ? (params.filter as Filter) : "all";
  const q = params.q?.trim() ?? "";

  let candidates: CandidateGame[] = [];
  let feedError: string | null = null;
  try {
    candidates = await weekCandidates(cfbd(), { year: season.year, week: weekNumber });
  } catch (error) {
    feedError = error instanceof Error ? error.message : "CollegeFootballData did not answer.";
  }
  const onSlate = new Map(slate.games.map((g) => [g.cfbdGameId, g]));
  const shown = candidates.filter((c) => matches(c, filter, q));
  const tiebreaker = slate.games.find((g) => g.id === slate.week.tiebreakerGameId) ?? null;
  const href = (overrides: Partial<{ week: number; filter: Filter; q: string }>) => {
    const p = new URLSearchParams();
    p.set("week", String(overrides.week ?? weekNumber));
    const f = overrides.filter ?? filter;
    if (f !== "all") p.set("filter", f);
    const query = overrides.q ?? q;
    if (query) p.set("q", query);
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
              <Link
                key={f.key}
                href={href({ filter: f.key })}
                className={`rounded-md px-3 py-2 text-sm font-semibold no-underline ${
                  f.key === filter ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                }`}
              >
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
            {shown.map((c) => {
              const picked = onSlate.get(c.cfbdGameId);
              return (
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
                    <Team name={c.awayTeam} rank={c.awayRank} /> <span className="text-muted-foreground">at</span>{" "}
                    <Team name={c.homeTeam} rank={c.homeRank} />
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
              );
            })}
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
                  {slate.games.length} game{slate.games.length === 1 ? "" : "s"} ·{" "}
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
              {slate.games.map((g) => (
                <SlateRow key={g.id} game={g} weekId={week.id} published={slate.week.published} tiebreaker={g.id === slate.week.tiebreakerGameId} />
              ))}
              {slate.games.length === 0 ? (
                <li className="p-3 text-sm text-muted-foreground">Add games from the candidates list.</li>
              ) : null}
            </ul>
          </section>

          <section className="space-y-3 rounded-md border border-border bg-card p-3">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-secondary">Deadline</p>
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
            {slate.week.published ? null : <PublishButton weekId={week.id} gameCount={slate.games.length} />}
          </section>
        </aside>
      </div>
    </div>
  );
}

function SlateRow({
  game,
  weekId,
  published,
  tiebreaker,
}: {
  game: Game;
  weekId: number;
  published: boolean;
  tiebreaker: boolean;
}) {
  return (
    <li className={`space-y-2 p-3 ${game.void ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-semibold">
            {game.awayTeam} at {game.homeTeam}
            {game.void ? <Badge variant="outline" className="ml-2">Void</Badge> : null}
          </p>
          <p className="text-xs text-muted-foreground">
            <LocalTime at={game.kickoff} />
            {game.spread ? ` · ${game.spread}` : ""}
            {game.voidNote ? ` · ${game.voidNote}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {game.void ? null : (
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
      {published && !game.void ? (
        <form action={voidGameAction} className="flex gap-2">
          <input type="hidden" name="gameId" value={game.id} />
          <Input name="note" required maxLength={120} placeholder="Void note (why)" aria-label="Void note" className="h-9" />
          <Button type="submit" size="sm" variant="destructive">
            Void
          </Button>
        </form>
      ) : null}
    </li>
  );
}
