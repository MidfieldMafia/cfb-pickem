import Link from "next/link";
import { db } from "@/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LocalTime } from "@/components/local-time";
import { MemberChip } from "@/components/member-chip";
import { SECTION_LABEL } from "@/components/section-label";
import { TeamName } from "@/components/team-name";
import { Wordmark } from "@/components/wordmark";
import { cfbdFromEnv } from "@/lib/cfbd/http";
import { requireMember } from "@/lib/members/current";
import { pickSheet } from "@/lib/picks/picks";
import { plural } from "@/lib/plural";
import {
  refreshResultsIfStale,
  revealFor,
  type Reveal,
} from "@/lib/results/results";
import { publishedSlate } from "@/lib/slate/slate";
import { RevealList } from "./reveal";

/**
 * Member traffic schedules the score feed: a visit after the Deadline pulls
 * CollegeFootballData when a game is past kickoff without a final, bounded
 * by the stale gate. A feed failure never breaks the page; the last scores
 * stand.
 */
async function refreshQuietly(weekId: number): Promise<void> {
  try {
    await refreshResultsIfStale(db(), cfbdFromEnv(), weekId);
  } catch (error) {
    console.warn(
      "Results refresh skipped:",
      error instanceof Error ? error.message : error,
    );
  }
}

/** The published Slate as a list, with the door into pick entry; after the Deadline, the Reveal. */
export default async function Week() {
  const member = await requireMember();
  const slate = await publishedSlate(db());
  const sheet = slate ? await pickSheet(db(), member, slate.week.id) : null;
  let reveal: Reveal | null = null;
  if (slate && sheet?.locked) {
    await refreshQuietly(slate.week.id);
    reveal = await revealFor(db(), member, slate.week.id);
  }
  const liveGames = sheet ? sheet.games.filter((g) => !g.void) : [];
  const picked = sheet
    ? liveGames.filter((g) => sheet.picks.some((p) => p.gameId === g.id)).length
    : 0;
  const allPicked = sheet !== null && picked === liveGames.length;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <Wordmark />
        <MemberChip member={member} />
      </header>

      {slate ? (
        <section className="space-y-3">
          <div className="rounded-md border border-border bg-card p-3 space-y-1">
            <p className={SECTION_LABEL}>
              {slate.season.year} · Week {slate.week.weekNumber}
            </p>
            <h1>{plural(slate.games.length, "game")} this week</h1>
            {slate.deadline ? (
              <p className="text-sm text-muted-foreground">
                Picks {sheet?.locked ? "locked" : "lock"}{" "}
                <LocalTime at={slate.deadline} style="deadline" />
              </p>
            ) : null}
            {sheet ? (
              <div className="space-y-2 pt-2">
                <p className="text-sm">
                  {sheet.locked
                    ? `You picked ${picked} of ${liveGames.length}.`
                    : `${picked} of ${liveGames.length} picked`}
                  {sheet.lockDropped
                    ? " · Lock voided"
                    : sheet.lockGameId !== null
                      ? " · Lock set"
                      : " · No Lock yet"}
                  {sheet.tiebreakerGuess !== null
                    ? ` · Tiebreaker ${sheet.tiebreakerGuess}`
                    : " · No Tiebreaker Guess yet"}
                </p>
                <Button asChild className="w-full">
                  <Link
                    href={
                      sheet.locked || allPicked ? "/picks/review" : "/picks"
                    }
                  >
                    {sheet.locked
                      ? "See your picks"
                      : allPicked
                        ? "Review your picks"
                        : picked
                          ? "Continue picking"
                          : "Make your picks"}
                  </Link>
                </Button>
              </div>
            ) : null}
          </div>
          {reveal ? (
            <RevealList reveal={reveal} viewerId={member.id} />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border bg-card">
              {slate.games.map((game) => (
                <li
                  key={game.id}
                  className={`space-y-1 p-3 ${game.void ? "opacity-60" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <TeamName
                      name={game.awayTeam}
                      rank={game.awayRank}
                      className="text-lg"
                    />
                    <span className="text-xs text-muted-foreground">at</span>
                    <TeamName
                      name={game.homeTeam}
                      rank={game.homeRank}
                      className="text-lg"
                    />
                  </div>
                  <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                    <LocalTime at={game.kickoff} />
                    {game.spread ? <span>· {game.spread}</span> : null}
                    {game.id === slate.week.tiebreakerGameId ? (
                      <Badge variant="outline">Tiebreaker</Badge>
                    ) : null}
                    {game.void ? (
                      <Badge variant="outline">
                        Void{game.voidNote ? `: ${game.voidNote}` : ""}
                      </Badge>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="rounded-md border border-border bg-card p-3 space-y-2">
          <p className={SECTION_LABEL}>This week</p>
          <h1>The slate isn&rsquo;t posted yet</h1>
          <p className="text-muted-foreground">
            Check back once a commissioner publishes this week&rsquo;s games.
            Your picks will live here.
          </p>
        </section>
      )}

      {member.isCommissioner ? (
        <Link
          href="/console/slate"
          className="text-sm font-semibold underline underline-offset-4"
        >
          Open the commissioner console
        </Link>
      ) : null}
    </main>
  );
}
