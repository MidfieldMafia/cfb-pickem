import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db";
import { AppHeader, Card, SECTION_LABEL } from "@saturday-slate/design-system";

import { GroupSwitcher } from "@/components/group-switcher";
import { MemberMenu } from "@/components/member-menu";
import { NoGroup } from "@/components/no-group";
import { RevealList } from "@/components/reveal";
import { cfbd } from "@/lib/cfbd";
import { currentGroupChoice, currentManageHref } from "@/lib/groups/current";
import { requireMember } from "@/lib/members/current";
import { pickBreakdown, tiebreakerOutcome, weeklyWinSentence } from "@/lib/results/summary";
import { weekParam } from "@/lib/slate/slate";
import { weekInReview } from "@/lib/week/week";
import { YourPicks } from "../your-week";

/**
 * One Week's Reveal (#244, board 10 of the #177 canvas): the Weekly Win, the
 * member's own picks game by game, then every member's pick on every game.
 * Opened from the card under a finished Week's standings, which already show
 * the Weekly Scores, so this screen leaves them out. It sits under
 * `/leaderboard` so the Leaderboard tab stays lit, and `/history/results`
 * redirects here.
 *
 * `?week=` chooses the Week and any Week the season has played is fair game;
 * without one, or with a Week that has not been played, the latest lands.
 * Nothing is stored: this is a scoring pass over the picks and results as
 * they stand, so a Result Override shows up here the next time it is opened.
 */
export default async function WeekReveal({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const member = await requireMember();
  const choice = await currentGroupChoice();
  if (choice === null) return <NoGroup member={member} />;
  const params = await searchParams;
  const review = await weekInReview(db(), weekParam(params.week), new Date(), { cfbd, group: choice.current.id });
  const menu = <MemberMenu member={member} group={<GroupSwitcher choice={choice} />} manage={await currentManageHref()} />;

  if (!review) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 pb-8">
        <AppHeader title="Reveal" right={menu} />
        <Card asChild className="mx-4 gap-2">
          <section>
            <p className={SECTION_LABEL}>Nothing to show yet</p>
            <p className="text-muted-foreground">
              A week&rsquo;s picks are revealed here once its deadline has passed and the games are under way.
            </p>
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

  const { slate, result } = review;
  const { reveal, scores, weeklyWin, complete } = result;
  const weekNumber = slate.week.weekNumber;
  const won = weeklyWinSentence(weeklyWin, complete);
  const mine = scores.find((s) => s.member.id === member.id) ?? null;
  // Only the members tied for first by points: theirs are the Guesses that
  // decided something. Empty when one member led outright.
  const guessers = new Set(
    tiebreakerOutcome(reveal, scores, weeklyWin)?.contenders.map((c) => c.member.id) ?? [],
  );

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 pb-8">
      <AppHeader
        title={`Week ${weekNumber} Reveal`}
        sub={`${slate.season.year} · Week ${weekNumber} · ${complete ? "Final" : "In progress"}`}
        right={menu}
      />

      <div className="-mb-3 -mt-1 px-4">
        <Link
          href={`/leaderboard?week=${weekNumber}`}
          className="tap inline-flex items-center gap-1 text-sm font-semibold no-underline"
        >
          <ChevronLeft size={18} aria-hidden />
          Week {weekNumber} standings
        </Link>
      </div>

      {won ? <p className="px-4 text-sm text-muted-foreground">{won}.</p> : null}

      {mine ? (
        <section className="space-y-2 px-4">
          <p className={SECTION_LABEL}>Your picks · Week {weekNumber}</p>
          <YourPicks rows={pickBreakdown(reveal, member.id)} tiebreakerGuess={mine.tiebreakerGuess} />
        </section>
      ) : (
        <section className="px-4">
          <Card>
            <p className="text-muted-foreground">
              You joined after this week&rsquo;s deadline, so Week {weekNumber} is not counted for or
              against you.
            </p>
          </Card>
        </section>
      )}

      <div className="px-4">
        <RevealList reveal={reveal} scores={scores} viewerId={member.id} guessers={guessers} />
      </div>
    </main>
  );
}
