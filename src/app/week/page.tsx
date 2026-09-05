import Link from "next/link";
import { db } from "@/db";
import { Badge } from "@/components/ui/badge";
import { LocalTime } from "@/components/local-time";
import { Pennant } from "@/components/pennant";
import { Wordmark } from "@/components/wordmark";
import { requireMember } from "@/lib/members/current";
import { publishedSlate } from "@/lib/slate/slate";

function Team({ name, rank }: { name: string; rank: number | null }) {
  return (
    <span className="font-display text-lg font-black">
      {rank ? <span className="mr-1 text-xs font-bold text-muted-foreground">#{rank}</span> : null}
      {name}
    </span>
  );
}

/** The published Slate as a list. Pick entry lands here in the next ticket. */
export default async function Week() {
  const member = await requireMember();
  const slate = await publishedSlate(db());

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <Wordmark />
        <Link href="/welcome" className="flex items-center gap-2 text-sm font-semibold no-underline">
          <Pennant avatarId={member.avatarId} size={28} />
          {member.displayName}
        </Link>
      </header>

      {slate ? (
        <section className="space-y-3">
          <div className="rounded-md border border-border bg-card p-3 space-y-1">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-secondary">
              {slate.season.year} · Week {slate.week.weekNumber}
            </p>
            <h1>
              {slate.games.length} game{slate.games.length === 1 ? "" : "s"} this week
            </h1>
            {slate.deadline ? (
              <p className="text-sm text-muted-foreground">
                Picks lock <LocalTime at={slate.deadline} style="deadline" />
              </p>
            ) : null}
          </div>
          <ul className="divide-y divide-border rounded-md border border-border bg-card">
            {slate.games.map((game) => (
              <li key={game.id} className={`space-y-1 p-3 ${game.void ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <Team name={game.awayTeam} rank={game.awayRank} />
                  <span className="text-xs text-muted-foreground">at</span>
                  <Team name={game.homeTeam} rank={game.homeRank} />
                </div>
                <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                  <LocalTime at={game.kickoff} />
                  {game.spread ? <span>· {game.spread}</span> : null}
                  {game.id === slate.week.tiebreakerGameId ? <Badge variant="outline">Tiebreaker</Badge> : null}
                  {game.void ? <Badge variant="outline">Void{game.voidNote ? `: ${game.voidNote}` : ""}</Badge> : null}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="rounded-md border border-border bg-card p-3 space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-secondary">This week</p>
          <h1>The slate isn&rsquo;t posted yet</h1>
          <p className="text-muted-foreground">
            Check back once a commissioner publishes this week&rsquo;s games. Your picks will live here.
          </p>
        </section>
      )}

      {member.isCommissioner ? (
        <Link href="/console/slate" className="text-sm font-semibold underline underline-offset-4">
          Open the commissioner console
        </Link>
      ) : null}
    </main>
  );
}
