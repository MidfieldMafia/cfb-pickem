import Link from "next/link";
import { db } from "@/db";
import { AppHeader } from "@/components/app-header";
import { BoardToggle } from "@/components/board-toggle";
import { MemberChip } from "@/components/member-chip";
import { RevealList } from "@/components/reveal";
import { SECTION_LABEL } from "@/components/section-label";
import { YourWeek } from "@/components/your-week";
import { cfbd } from "@/lib/cfbd";
import { requireMember } from "@/lib/members/current";
import {
  pickBreakdown,
  standing,
  tiebreakerOutcome,
  tiebreakerSentence,
  weeklyWinSentence,
} from "@/lib/results/summary";
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
  const params = await searchParams;
  const review = await weekInReview(db(), member, weekParam(params.week), new Date(), { cfbd });

  if (!review) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 pb-8">
        <AppHeader title="Week results" right={<MemberChip member={member} />} />
        <div className="px-4">
          <BoardToggle active="results" weekNumber={null} />
        </div>
        <section className="mx-4 space-y-2 rounded-md border border-border bg-card p-3">
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
      </main>
    );
  }

  const { slate, result, played } = review;
  const { reveal, scores, weeklyWin, complete } = result;
  const weekNumber = slate.week.weekNumber;
  const won = weeklyWinSentence(weeklyWin, complete);
  const winners = new Set(weeklyWin?.winners.map((m) => m.id) ?? []);
  const mine = scores.find((s) => s.member.id === member.id) ?? null;
  const place = standing(scores, member.id);
  const tiebreaker = tiebreakerSentence(tiebreakerOutcome(reveal, scores));

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 pb-8">
      <AppHeader
        title={`Week ${weekNumber} results`}
        sub={`${complete ? "Final" : "In progress"}${won ? ` · ${won}` : ""}`}
        right={<MemberChip member={member} />}
      />

      <div className="px-4">
        <BoardToggle active="results" weekNumber={weekNumber} />
      </div>

      {/* Past weeks are plain links: a GET per week, nothing to hydrate, and
          the one on screen is the one the URL names. */}
      <nav aria-label="Weeks" className="flex flex-wrap gap-2 px-4">
        {played.map((number) => {
          const here = number === weekNumber;
          return (
            <Link
              key={number}
              href={`/results?week=${number}`}
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

      <section className="px-4">
        {mine && place ? (
          <YourWeek weekNumber={weekNumber} score={mine} place={place} />
        ) : (
          <div className="rounded-md border border-border bg-card p-3">
            <p className="text-muted-foreground">
              You joined after this week&rsquo;s deadline, so Week {weekNumber} is not counted for or
              against you.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-2 px-4">
        <p className={SECTION_LABEL}>Weekly score</p>
        <WeeklyScoreList scores={scores} winners={winners} viewerId={member.id} />
        {tiebreaker ? <p className="text-sm text-muted-foreground">{tiebreaker}</p> : null}
      </section>

      {mine ? (
        <section className="space-y-2 px-4">
          <p className={SECTION_LABEL}>Your picks · Week {weekNumber}</p>
          <YourPicks rows={pickBreakdown(reveal, member.id)} tiebreakerGuess={mine.tiebreakerGuess} />
        </section>
      ) : null}

      <div className="px-4">
        <RevealList reveal={reveal} viewerId={member.id} />
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
