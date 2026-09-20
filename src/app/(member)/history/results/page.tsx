import Link from "next/link";
import { db } from "@/db";
import { AppHeader, Card, SECTION_LABEL } from "@saturday-slate/design-system";

import { MemberMenu } from "@/components/member-menu";
import { NoGroup } from "@/components/no-group";
import { RevealList } from "@/components/reveal";
import { cfbd } from "@/lib/cfbd";
import { currentGroup, currentManageHref } from "@/lib/groups/current";
import { requireMember } from "@/lib/members/current";
import { pickBreakdown, tiebreakerOutcome, weeklyWinSentence } from "@/lib/results/summary";
import { weekParam } from "@/lib/slate/slate";
import { weekInReview } from "@/lib/week/week";
import { WeeklyScoreList } from "./weekly-score";
import { YourPicks } from "./your-week";

/**
 * One Week's results: every member's Weekly Score, the Weekly Win and how it
 * was decided, what the Tiebreaker Game settled, the member's own picks game
 * by game, and the Reveal board.
 *
 * `?week=` chooses the Week and any Week the season has played is fair game;
 * without one, or with a Week that has not been played, the latest lands.
 * Nothing is stored: this is a scoring pass over the picks and results as
 * they stand, so a Result Override shows up here the next time it is opened.
 */
export default async function WeekResults({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const member = await requireMember();
  const group = await currentGroup();
  if (group === null) return <NoGroup member={member} />;
  const params = await searchParams;
  const review = await weekInReview(db(), weekParam(params.week), new Date(), { cfbd, group });

  if (!review) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 pb-8">
        <AppHeader
          title="Week results"
          right={<MemberMenu member={member} manage={await currentManageHref()} />}
        />
        <Card asChild className="mx-4 gap-2">
          <section>
            <p className={SECTION_LABEL}>Nothing to show yet</p>
            <p className="text-muted-foreground">
              Results land here once a week&rsquo;s deadline has passed and the games are under way.
            </p>
            {/* `tap` for the 44px floor, as on the link at the foot of a week that
                has results: this branch renders only before the first Deadline,
                which is why a 19px target sat here unmeasured. */}
            <Link
              href="/leaderboard"
              className="tap inline-flex items-center text-sm font-semibold underline underline-offset-4"
            >
              See the leaderboard
            </Link>
          </section>
        </Card>
      </main>
    );
  }

  const { slate, result, played } = review;
  const { reveal, scores, weeklyWin, complete } = result;
  const weekNumber = slate.week.weekNumber;
  const won = weeklyWinSentence(weeklyWin, complete);
  const winners = new Set(weeklyWin?.winners.map((m) => m.id) ?? []);
  const mine = scores.find((s) => s.member.id === member.id) ?? null;
  // Only the members tied for first by points: theirs are the Guesses that
  // decided something. Empty when one member led outright.
  const guessers = new Set(
    tiebreakerOutcome(reveal, scores, weeklyWin)?.contenders.map((c) => c.member.id) ?? [],
  );

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 pb-8">
      <AppHeader
        title={`Week ${weekNumber} results`}
        sub={complete ? "Final" : "In progress"}
        right={<MemberMenu member={member} manage={await currentManageHref()} />}
      />

      {won ? <p className="px-4 text-sm text-muted-foreground">{won}.</p> : null}

      {/* Past weeks are plain links: a GET per week, nothing to hydrate, and
          the one on screen is the one the URL names. */}
      <nav aria-label="Weeks" className="flex flex-wrap gap-2 px-4">
        {played.map((number) => {
          const here = number === weekNumber;
          return (
            <Link
              key={number}
              href={`/history/results?week=${number}`}
              aria-current={here ? "page" : undefined}
              className={`flex min-h-tap items-center rounded-full border px-3 text-sm font-bold no-underline ${
                here ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground"
              }`}
            >
              Week {number}
            </Link>
          );
        })}
      </nav>

      {/* No pine summary card: the member's own row in the table below, tinted,
          already says their place, points and record. */}
      {mine ? null : (
        <section className="px-4">
          <Card>
            <p className="text-muted-foreground">
              You joined after this week&rsquo;s deadline, so Week {weekNumber} is not counted for or
              against you.
            </p>
          </Card>
        </section>
      )}

      <section className="space-y-2 px-4">
        <p className={SECTION_LABEL}>Weekly score</p>
        <WeeklyScoreList scores={scores} winners={winners} viewerId={member.id} guessers={guessers} />
      </section>

      {mine ? (
        <section className="space-y-2 px-4">
          <p className={SECTION_LABEL}>Your picks · Week {weekNumber}</p>
          <YourPicks rows={pickBreakdown(reveal, member.id)} tiebreakerGuess={mine.tiebreakerGuess} />
        </section>
      ) : null}

      <div className="px-4">
        <RevealList reveal={reveal} scores={scores} viewerId={member.id} guessers={guessers} />
      </div>

      <div className="px-4">
        <Link
          href="/leaderboard"
          className="tap inline-flex items-center text-sm font-semibold underline underline-offset-4"
        >
          See the season leaderboard
        </Link>
      </div>
    </main>
  );
}
