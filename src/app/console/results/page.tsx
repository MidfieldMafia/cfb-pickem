import { Ban, Pencil, Radio } from "lucide-react";
import { db } from "@/db";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { LocalTime } from "@/components/local-time";
import { TeamLogo } from "@/components/team-logo";
import { requireConsole } from "@/lib/members/current";
import { MAX_NOTE } from "@/lib/notes";
import {
  clockLabel,
  MAX_SCORE,
  resultsConsole,
  type GameResult,
  type ResultAudit,
  type ResultLabel,
} from "@/lib/results/results";
import { isVoid, type GameView } from "@/lib/slate/json";
import { weekParam } from "@/lib/slate/slate";
import {
  clearOverrideAction,
  overrideResultAction,
  refreshResultsAction,
  restoreGameAction,
  voidResultAction,
} from "./actions";
import { ActionForm } from "../action-form";

function Team({ name, rank }: { name: string; rank: number | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-display font-black">
      <TeamLogo team={name} size={20} />
      {rank ? <span className="text-xs font-bold text-muted-foreground">#{rank}</span> : null}
      {name}
    </span>
  );
}

/** How each of the result's five words is dressed. The words themselves come from the result. */
const TONES: Record<ResultLabel, { variant?: "outline"; className?: string }> = {
  Scheduled: { variant: "outline" },
  "In progress": { className: "bg-live text-live-foreground" },
  Final: {},
  "Final · override": { className: "bg-secondary text-secondary-foreground" },
  Void: { variant: "outline" },
};

/**
 * The result's label, unless the game is overdue for a commissioner's
 * attention. A game in progress carries the broadcast mark as well as the hot
 * orange, so the one state that moves is not told by hue alone.
 */
function StatusBadge({ result, review }: { result: GameResult; review: boolean }) {
  if (review) return <Badge variant="destructive">Needs review</Badge>;
  const clock = result.live ? clockLabel(result.live) : null;
  return (
    <Badge {...TONES[result.label]}>
      {result.label === "In progress" ? <Radio size={12} aria-hidden /> : null}
      {result.label}
      {clock ? ` · ${clock}` : ""}
    </Badge>
  );
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
  const { week, rows, review, feedCheckedAt, log } = await resultsConsole(
    db(),
    commissioner,
    weekParam(params.week),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1>Result overrides</h1>
        <p className="text-sm text-muted-foreground">
          Week {week.weekNumber} · scores from CollegeFootballData
        </p>
      </div>

      <p className="max-w-3xl text-sm text-muted-foreground">
        Scores come from CollegeFootballData whenever members open the week while a game is past kickoff, at most
        every five minutes. Override only when the feed is wrong or a game will not be played. Voiding a game scores
        zero for everyone and drops any Lock on it.
      </p>

      {!week.published ? (
        <p role="status" className="rounded-md border border-border bg-card p-3 text-sm">
          Week {week.weekNumber} is not published. Results and overrides start once the slate is out.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/*
              This is the stale gate's claim, and member traffic is its only
              writer, so the label says so. "Feed last checked" read as though
              the button beside it moved this — and it did, until the claim
              stopped being taken on a commissioner's behalf.
            */}
            <p className="text-sm text-muted-foreground">
              {feedCheckedAt ? (
                <>
                  Members last pulled the feed <LocalTime at={feedCheckedAt} />
                </>
              ) : (
                "No member has pulled the feed for this week yet."
              )}
            </p>
            <ActionForm
              action={refreshResultsAction}
              hidden={{ weekId: week.id }}
              submit="Check the feed now"
              pendingLabel="Checking…"
              size="default"
              className="space-y-1 text-right"
            />
          </div>

          {review ? (
            <p role="alert" className="rounded-md border border-destructive bg-card p-3 text-sm font-semibold">
              {review.subject} still not final {review.hours} hours after kickoff. The feed has no postponed or
              canceled status, so it stays pending until you act: set the score if it finished, or void it if it will
              not be played.
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
                {rows.map((row) => {
                  const { game, result, review: overdue } = row;
                  const voided = isVoid(row);
                  return (
                    <tr key={game.id} className={`align-top ${voided ? "opacity-70" : ""}`}>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Team name={game.awayTeam} rank={game.awayRank} />
                          <span className="text-muted-foreground">at</span>
                          <Team name={game.homeTeam} rank={game.homeRank} />
                          {game.id === week.tiebreakerGameId ? (
                            <Badge className="bg-secondary text-secondary-foreground">Tiebreaker</Badge>
                          ) : null}
                        </div>
                        {voided && result.note ? (
                          <p className="mt-1 text-xs text-muted-foreground">Void: {result.note}</p>
                        ) : null}
                        {result.source === "override" ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Override: {result.note}
                            {result.feedFinal
                              ? ` · feed says ${result.feedFinal.awayScore}–${result.feedFinal.homeScore}`
                              : " · feed has no final"}
                          </p>
                        ) : null}
                      </td>
                      <td className="p-3 whitespace-nowrap text-muted-foreground">
                        <LocalTime at={game.kickoff} style="slot" />
                      </td>
                      <td className="p-3 text-right font-display text-lg font-black tabular-nums">
                        {result.shown?.awayScore ?? "–"}
                      </td>
                      <td className="p-3 text-right font-display text-lg font-black tabular-nums">
                        {result.shown?.homeScore ?? "–"}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <StatusBadge result={result} review={overdue} />
                      </td>
                      <td className="p-3">
                        {voided ? (
                          <ActionForm
                            action={restoreGameAction}
                            hidden={{ gameId: game.id }}
                            submit="Restore game"
                            pendingLabel="Restoring…"
                          />
                        ) : (
                          <OverrideCell row={row} />
                        )}
                      </td>
                    </tr>
                  );
                })}
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

/** The two disclosures' handles, as the mockups draw them: a button, and a word. */
const SET_SCORE = "inline-flex min-h-tap w-fit cursor-pointer items-center gap-1.5 rounded-md border border-input px-3 font-semibold hover:bg-accent";
const VOID = "inline-flex min-h-tap w-fit cursor-pointer items-center gap-1.5 font-semibold text-destructive";

/**
 * Set the score, clear an override, or void: everything a live game's last
 * column offers — folded away until asked for. Ten rows each standing two
 * score boxes and two notes open made the week's scores unreadable, and
 * overriding is the exception, not the routine.
 */
function OverrideCell({ row }: { row: GameView }) {
  const { game, result } = row;
  const matchup = `${game.awayTeam} at ${game.homeTeam}`;
  return (
    // Both handles on one line, as the mockup has them, so a row of scores
    // stays a row and not a stack.
    <div className="flex flex-wrap items-start gap-x-3">
      <details>
        <summary aria-label={`Set the score for ${matchup}`} className={SET_SCORE}>
          <Pencil size={14} aria-hidden />
          Set score
        </summary>
        <ActionForm
          action={overrideResultAction}
          hidden={{ gameId: game.id }}
          submit="Save score"
          pendingLabel="Saving…"
          className="mt-2 space-y-2"
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
            // "Away", not the team: the column above says which team that is,
            // and a name wide enough to matter is a name that gets clipped.
            placeholder="Away"
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
            placeholder="Home"
            className="h-9 w-20"
          />
          <Input
            name="note"
            required
            maxLength={MAX_NOTE}
            placeholder="Why (required)"
            aria-label={`Override note for ${matchup}`}
            className="h-9 w-44"
          />
        </ActionForm>
      </details>
      {result.source === "override" ? (
        <ActionForm
          action={clearOverrideAction}
          hidden={{ gameId: game.id }}
          submit="Clear override"
          pendingLabel="Clearing…"
          variant="ghost"
        />
      ) : null}
      <details>
        <summary aria-label={`Void ${matchup}`} className={VOID}>
          <Ban size={14} aria-hidden />
          Void
        </summary>
        <ActionForm
          action={voidResultAction}
          hidden={{ gameId: game.id }}
          submit="Void"
          pendingLabel="Voiding…"
          variant="destructive"
          className="mt-2 space-y-2"
        >
          <Input
            name="note"
            required
            maxLength={MAX_NOTE}
            placeholder="Void note (why)"
            aria-label={`Void note for ${matchup}`}
            className="h-9 w-44"
          />
        </ActionForm>
      </details>
    </div>
  );
}
