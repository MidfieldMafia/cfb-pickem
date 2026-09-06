import { db } from "@/db";
import type { Game } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocalTime } from "@/components/local-time";
import { TeamLogo } from "@/components/team-logo";
import { requireConsole } from "@/lib/members/current";
import {
  effectiveResult,
  MAX_SCORE,
  needsReview,
  resultAuditsFor,
  REVIEW_AFTER_MS,
  type GameResult,
  type ResultAudit,
} from "@/lib/results/results";
import { activeSeason, isWeekNumber, openWeek, seasonWeeks, slateFor, WEEK_NUMBERS } from "@/lib/slate/slate";
import {
  chooseResultsWeekAction,
  clearOverrideAction,
  overrideResultAction,
  refreshResultsAction,
  restoreGameAction,
  voidResultAction,
} from "./actions";
import { ResultForm } from "./result-form";

const REVIEW_HOURS = REVIEW_AFTER_MS / 3600_000;

function Team({ name, rank }: { name: string; rank: number | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-display font-black">
      <TeamLogo team={name} size={20} />
      {rank ? <span className="text-xs font-bold text-muted-foreground">#{rank}</span> : null}
      {name}
    </span>
  );
}

function StatusBadge({ game, result, now }: { game: Game; result: GameResult; now: Date }) {
  if (result.status === "void") return <Badge variant="outline">Void</Badge>;
  if (result.status === "final") {
    return (
      <Badge className={result.source === "override" ? "bg-secondary text-secondary-foreground" : ""}>
        {result.source === "override" ? "Final · override" : "Final"}
      </Badge>
    );
  }
  if (needsReview(game, now)) return <Badge variant="destructive">Needs review</Badge>;
  if (game.status === "in_progress") return <Badge className="bg-live text-live-foreground">In progress</Badge>;
  return <Badge variant="outline">Scheduled</Badge>;
}

const KINDS: Record<ResultAudit["kind"], string> = {
  override: "set the score",
  clear_override: "cleared the override",
  void: "voided",
  restore: "restored",
};

export default async function ResultOverrides({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const commissioner = await requireConsole();
  const params = await searchParams;
  const database = db();
  const season = await activeSeason(database);
  const existing = await seasonWeeks(database, season);
  const requested = Number(params.week);
  const weekNumber = isWeekNumber(requested)
    ? requested
    : existing.filter((w) => w.published).at(-1)?.weekNumber ?? existing.at(-1)?.weekNumber ?? 1;
  const week = await openWeek(database, commissioner, weekNumber);
  const slate = await slateFor(database, week.id);
  const log = await resultAuditsFor(database, commissioner, week.id);
  const now = new Date();
  const rows = slate.games.map((game) => ({ game, result: effectiveResult(game), review: needsReview(game, now) }));
  const reviewCount = rows.filter((r) => r.review).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Result overrides</h1>
          <p className="text-sm text-muted-foreground">
            {season.year} · Week {weekNumber} · scores from CollegeFootballData
          </p>
        </div>
        <form action={chooseResultsWeekAction} className="flex items-center gap-2 text-sm font-semibold">
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

      <p className="max-w-3xl text-sm text-muted-foreground">
        Scores come from CollegeFootballData whenever members open the week while a game is past kickoff, at most
        every five minutes. Override only when the feed is wrong or a game will not be played. Voiding a game scores
        zero for everyone and drops any Lock on it.
      </p>

      {!slate.week.published ? (
        <p role="status" className="rounded-md border border-border bg-card p-3 text-sm">
          Week {weekNumber} is not published. Results and overrides start once the slate is out.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {slate.week.scoreboardFetchedAt ? (
                <>
                  Feed last checked <LocalTime at={slate.week.scoreboardFetchedAt} />
                </>
              ) : (
                "The feed has not been checked for this week yet."
              )}
            </p>
            <ResultForm
              action={refreshResultsAction}
              hidden={{ weekId: week.id }}
              submit="Check the feed now"
              pendingLabel="Checking…"
              size="default"
              className="space-y-1 text-right"
            />
          </div>

          {reviewCount > 0 ? (
            <p role="alert" className="rounded-md border border-destructive bg-card p-3 text-sm font-semibold">
              {reviewCount === 1 ? "One game is" : `${reviewCount} games are`} still not final {REVIEW_HOURS} hours after
              kickoff. The feed has no postponed or canceled status, so it stays pending until you act: set the score if
              it finished, or void it if it will not be played.
            </p>
          ) : null}

          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                <tr>
                  <th className="p-3">Game</th>
                  <th className="p-3">Kickoff</th>
                  <th className="p-3 text-right">Away</th>
                  <th className="p-3 text-right">Home</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Override</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(({ game, result }) => (
                  <tr key={game.id} className={`align-top ${game.void ? "opacity-70" : ""}`}>
                    <td className="p-3">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Team name={game.awayTeam} rank={game.awayRank} />
                        <span className="text-muted-foreground">at</span>
                        <Team name={game.homeTeam} rank={game.homeRank} />
                        {game.id === slate.week.tiebreakerGameId ? (
                          <Badge className="bg-secondary text-secondary-foreground">Tiebreaker</Badge>
                        ) : null}
                      </div>
                      {game.void && game.voidNote ? (
                        <p className="mt-1 text-xs text-muted-foreground">Void: {game.voidNote}</p>
                      ) : null}
                      {result.source === "override" ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Override: {game.overrideNote}
                          {game.status === "final" && game.homeScore !== null
                            ? ` · feed says ${game.awayScore}–${game.homeScore}`
                            : " · feed has no final"}
                        </p>
                      ) : null}
                    </td>
                    <td className="p-3 whitespace-nowrap text-muted-foreground">
                      <LocalTime at={game.kickoff} style="slot" />
                    </td>
                    <td className="p-3 text-right font-display text-lg font-black tabular-nums">
                      {result.awayScore ?? (game.status === "in_progress" ? game.awayScore : "–")}
                    </td>
                    <td className="p-3 text-right font-display text-lg font-black tabular-nums">
                      {result.homeScore ?? (game.status === "in_progress" ? game.homeScore : "–")}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <StatusBadge game={game} result={result} now={now} />
                    </td>
                    <td className="p-3">
                      {game.void ? (
                        <ResultForm
                          action={restoreGameAction}
                          hidden={{ gameId: game.id }}
                          submit="Restore game"
                          pendingLabel="Restoring…"
                        />
                      ) : (
                        <div className="space-y-2">
                          <ResultForm
                            action={overrideResultAction}
                            hidden={{ gameId: game.id }}
                            submit="Set score"
                            pendingLabel="Saving…"
                          >
                            <Input
                              name="awayScore"
                              type="number"
                              min={0}
                              max={MAX_SCORE}
                              step={1}
                              required
                              defaultValue={result.awayScore ?? ""}
                              aria-label={`${game.awayTeam} score`}
                              placeholder={game.awayTeam}
                              className="h-9 w-20"
                            />
                            <Input
                              name="homeScore"
                              type="number"
                              min={0}
                              max={MAX_SCORE}
                              step={1}
                              required
                              defaultValue={result.homeScore ?? ""}
                              aria-label={`${game.homeTeam} score`}
                              placeholder={game.homeTeam}
                              className="h-9 w-20"
                            />
                            <Input
                              name="note"
                              required
                              maxLength={200}
                              placeholder="Why (required)"
                              aria-label={`Override note for ${game.awayTeam} at ${game.homeTeam}`}
                              className="h-9 w-44"
                            />
                          </ResultForm>
                          <div className="flex flex-wrap gap-2">
                            {result.source === "override" ? (
                              <ResultForm
                                action={clearOverrideAction}
                                hidden={{ gameId: game.id }}
                                submit="Clear override"
                                pendingLabel="Clearing…"
                                variant="ghost"
                              />
                            ) : null}
                            <ResultForm
                              action={voidResultAction}
                              hidden={{ gameId: game.id }}
                              submit="Void"
                              pendingLabel="Voiding…"
                              variant="destructive"
                            >
                              <Input
                                name="note"
                                required
                                maxLength={120}
                                placeholder="Void note (why)"
                                aria-label={`Void note for ${game.awayTeam} at ${game.homeTeam}`}
                                className="h-9 w-44"
                              />
                            </ResultForm>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-3 text-muted-foreground">
                      No games on this slate.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <section className="rounded-md border border-border bg-card">
            <div className="border-b border-border p-3">
              <h2>Change log</h2>
              <p className="text-sm text-muted-foreground">Every override, clear, void, and restore for this week.</p>
            </div>
            <ul className="divide-y divide-border">
              {log.map((entry) => (
                <li key={entry.id} className="p-3 text-sm">
                  <p>
                    <span className="font-semibold">{entry.changedByName}</span> {KINDS[entry.kind]}{" "}
                    <span className="font-semibold">
                      {entry.awayTeam} at {entry.homeTeam}
                    </span>
                    : {entry.previousValue} → {entry.newValue}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <LocalTime at={entry.changedAt} />
                    {entry.note ? ` · ${entry.note}` : ""}
                  </p>
                </li>
              ))}
              {log.length === 0 ? <li className="p-3 text-sm text-muted-foreground">No changes yet.</li> : null}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
