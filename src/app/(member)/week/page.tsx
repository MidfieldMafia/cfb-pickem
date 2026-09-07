import Link from "next/link";
import { db } from "@/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LocalTime } from "@/components/local-time";
import { MemberChip } from "@/components/member-chip";
import { RevealList } from "@/components/reveal";
import { SECTION_LABEL } from "@/components/section-label";
import { TeamName } from "@/components/team-name";
import { Wordmark } from "@/components/wordmark";
import { cfbd } from "@/lib/cfbd";
import { requireMember } from "@/lib/members/current";
import { remainingLabel } from "@/lib/picks/progress";
import { plural } from "@/lib/plural";
import { isVoid, toSlateJson, voidNote } from "@/lib/slate/json";
import { currentWeek } from "@/lib/week/week";
import { callToAction } from "./call-to-action";

/** The published Slate as a list, with the door into pick entry; after the Deadline, the Reveal. */
export default async function Week() {
  const member = await requireMember();
  const week = await currentWeek(db(), member, new Date(), {
    graded: true,
    cfbd,
  });
  const slate = week ? toSlateJson(week.slate) : null;
  const sheet = week?.sheet ?? null;
  const reveal = week?.result?.reveal ?? null;
  const next = sheet ? callToAction(sheet.progress, sheet.locked) : null;

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
              {slate.year} · Week {slate.week.weekNumber}
            </p>
            <h1>{plural(slate.games.length, "game")} this week</h1>
            {slate.deadline ? (
              <p className="text-sm text-muted-foreground">
                Picks {sheet?.locked ? "locked" : "lock"}{" "}
                <LocalTime at={slate.deadline} style="deadline" />
              </p>
            ) : null}
            {sheet && next ? (
              <div className="space-y-2 pt-2">
                <p className="text-sm font-semibold">
                  {remainingLabel(
                    sheet.progress,
                    slate.week.weekNumber,
                    sheet.locked,
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {sheet.locked
                    ? `You picked ${sheet.progress.picksMade} of ${sheet.progress.liveGames}.`
                    : `${sheet.progress.picksMade} of ${sheet.progress.liveGames} picked`}
                  {sheet.lockDropped
                    ? " · Lock voided"
                    : sheet.progress.lockSet
                      ? " · Lock set"
                      : " · No Lock yet"}
                  {sheet.progress.guessSet
                    ? ` · Tiebreaker ${sheet.tiebreakerGuess}`
                    : " · No Tiebreaker Guess yet"}
                </p>
                <Button asChild className="w-full">
                  <Link href={next.href}>{next.label}</Link>
                </Button>
              </div>
            ) : null}
          </div>
          {reveal ? (
            <RevealList reveal={reveal} viewerId={member.id} />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border bg-card">
              {slate.games.map((view) => {
                const { game } = view;
                const why = voidNote(view);
                return (
                  <li
                    key={game.id}
                    className={`space-y-1 p-3 ${isVoid(view) ? "opacity-60" : ""}`}
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
                      {isVoid(view) ? (
                        <Badge variant="outline">Void{why ? `: ${why}` : ""}</Badge>
                      ) : null}
                    </p>
                  </li>
                );
              })}
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

    </main>
  );
}
