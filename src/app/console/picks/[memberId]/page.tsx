import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { LocalTime } from "@/components/local-time";
import { Pennant } from "@/components/pennant";
import { requireConsole } from "@/lib/members/current";
import { InvalidMember } from "@/lib/members/members";
import { memberSheet } from "@/lib/picks/console";
import { MAX_TIEBREAKER_GUESS } from "@/lib/picks/limits";
import { InvalidPick } from "@/lib/picks/picks";
import { safeInteger } from "@/lib/parse";
import { activeSeason, openWeek, seasonWeeks } from "@/lib/slate/slate";
import { ActionForm } from "../../action-form";
import { requestedWeekNumber } from "../../week-param";
import { overrideLockAction, overrideTiebreakerAction } from "../actions";
import { GamePickForm } from "./game-pick-form";

export default async function MemberPicks({
  params,
  searchParams,
}: {
  params: Promise<{ memberId: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const commissioner = await requireConsole();
  const memberId = safeInteger((await params).memberId);
  if (memberId === null) notFound();
  const query = await searchParams;
  const database = db();
  const season = await activeSeason(database);
  const existing = await seasonWeeks(database, season);
  const weekNumber = requestedWeekNumber(existing, query.week);
  const week = await openWeek(database, commissioner, weekNumber, season);

  let loaded;
  try {
    loaded = await memberSheet(database, commissioner, memberId, week.id);
  } catch (error) {
    if (error instanceof InvalidMember) notFound();
    if (error instanceof InvalidPick) {
      return (
        <div className="mx-auto max-w-3xl space-y-4">
          <BackLink weekNumber={weekNumber} />
          <p role="status" className="rounded-md border border-border bg-card p-3 text-sm">
            Week {weekNumber} is not published, so there are no picks to enter yet.
          </p>
        </div>
      );
    }
    throw error;
  }
  const { member, sheet } = loaded;
  const pickFor = new Map(sheet.picks.map((p) => [p.gameId, p.teamId]));
  const pickedGames = sheet.games.filter((g) => !g.void && pickFor.has(g.id));
  const hidden = { memberId: member.id, weekId: week.id };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink weekNumber={weekNumber} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Pennant avatarId={member.avatarId} size={44} />
          <div>
            <h1>{member.displayName}&apos;s picks</h1>
            <p className="text-sm text-muted-foreground">
              {season.year} · Week {weekNumber} · Deadline <LocalTime at={sheet.deadline} style="deadline" />
            </p>
          </div>
        </div>
        {sheet.locked ? <Badge variant="destructive">After the deadline</Badge> : <Badge variant="outline">Open</Badge>}
      </div>

      <p className="text-sm text-muted-foreground">
        Anything you change here is saved as {member.displayName}&apos;s pick and written to the change log with your
        name, whether or not the deadline has passed.
      </p>

      <ul className="divide-y divide-border rounded-md border border-border bg-card">
        {sheet.games.map((game) => (
          <li key={game.id} className={`p-3 ${game.void ? "opacity-60" : ""}`}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                <LocalTime at={game.kickoff} style="slot" />
                {game.id === sheet.week.tiebreakerGameId ? " · Tiebreaker Game" : ""}
                {sheet.lockGameId === game.id ? (sheet.lockDropped ? " · Dropped Lock" : " · Lock of the Week") : ""}
              </span>
              {game.void ? <Badge variant="outline">Void{game.voidNote ? `: ${game.voidNote}` : ""}</Badge> : null}
            </div>
            {game.void ? (
              <p className="text-sm">
                {game.awayTeam} at {game.homeTeam}
              </p>
            ) : (
              <GamePickForm
                hidden={{ ...hidden, gameId: game.id }}
                away={{ id: game.awayTeamId, name: game.awayTeam, rank: game.awayRank }}
                home={{ id: game.homeTeamId, name: game.homeTeam, rank: game.homeRank }}
                picked={pickFor.get(game.id) ?? null}
              />
            )}
          </li>
        ))}
      </ul>

      <section className="space-y-3 rounded-md border border-border bg-card p-4">
        <h2>Lock of the Week</h2>
        <ActionForm action={overrideLockAction} hidden={hidden} submit="Save Lock" pendingLabel="Saving…">
          <select
            name="gameId"
            defaultValue={sheet.lockGameId ?? ""}
            aria-label="Lock of the Week"
            className="h-9 rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="">No Lock</option>
            {pickedGames.map((game) => (
              <option key={game.id} value={game.id}>
                {pickFor.get(game.id) === game.homeTeamId ? game.homeTeam : game.awayTeam} ({game.awayTeam} at{" "}
                {game.homeTeam})
              </option>
            ))}
          </select>
        </ActionForm>
        <p className="text-xs text-muted-foreground">
          {sheet.lockDropped
            ? "The Lock sits on a void game, so it counts for nothing until it is moved to a live pick. "
            : ""}
          Only picked games can carry the Lock. Save with “No Lock” to clear it.
        </p>
      </section>

      <section className="space-y-3 rounded-md border border-border bg-card p-4">
        <h2>Tiebreaker Guess</h2>
        <ActionForm action={overrideTiebreakerAction} hidden={hidden} submit="Save guess" pendingLabel="Saving…">
          <Input
            name="guess"
            type="number"
            min={0}
            max={MAX_TIEBREAKER_GUESS}
            step={1}
            defaultValue={sheet.tiebreakerGuess ?? ""}
            aria-label="Tiebreaker Guess"
            placeholder="Combined points"
            className="h-9 w-40"
          />
        </ActionForm>
        <p className="text-xs text-muted-foreground">The combined final score of the Tiebreaker Game. Leave it empty to clear.</p>
      </section>
    </div>
  );
}

function BackLink({ weekNumber }: { weekNumber: number }) {
  return (
    <Link href={`/console/picks?week=${weekNumber}`} className="text-sm font-semibold">
      ← Who hasn&apos;t picked
    </Link>
  );
}
