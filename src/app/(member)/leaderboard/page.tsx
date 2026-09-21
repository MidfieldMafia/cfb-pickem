import Link from "next/link";
import { db } from "@/db";
import { AppHeader } from "@saturday-slate/design-system";

import { GroupSwitcher } from "@/components/group-switcher";
import { MemberMenu } from "@/components/member-menu";
import { NoGroup } from "@/components/no-group";
import { currentGroupChoice, currentManageHref } from "@/lib/groups/current";
import { requireMember } from "@/lib/members/current";
import { seasonResult } from "@/lib/results/results";
import { seasonChampion, seasonStatusLabel, weeklyWinSentence } from "@/lib/results/summary";
import { MAX_WEEK_NUMBER, weekParam } from "@/lib/slate/slate";
import { WeeklyScoreList } from "../history/results/weekly-score";
import { LeaderboardTable } from "./leaderboard-table";

/**
 * The season standings, computed on every read: nothing here is stored, so a
 * Result Override on the results console changes this table the next time it
 * is opened.
 *
 * Only Weeks whose Deadline has passed count (`playedWeeks`), so a Week in
 * progress never appears as a week everyone scored zero in.
 *
 * `?week=` swaps the season table for that one Week's standings. They come
 * out of the same `seasonResult` pass, so a week's board and the season it
 * feeds cannot disagree, and choosing a week costs no further query. A Week
 * that has not been played falls back to the season.
 */
export default async function Leaderboard({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const member = await requireMember();
  const choice = await currentGroupChoice();
  if (choice === null) return <NoGroup member={member} />;
  const season = await seasonResult(db(), choice.current.id, new Date());
  const played = season.weeks;
  const latest = played[played.length - 1];
  const { week: requested } = await searchParams;
  const requestedNumber = weekParam(requested);
  const shown = played.find((w) => w.week.weekNumber === requestedNumber) ?? null;
  // Null when nobody played the Week, which is not the same as an empty
  // sentence: interpolating it straight into the footnote puts "null" on the board.
  const won = shown ? weeklyWinSentence(shown.weeklyWin, shown.complete) : null;
  // Movement is measured against the board before the latest played Week. With
  // one week played there is no such board, so there are no arrows to explain.
  const movedSince = played.length > 1 ? played[played.length - 2].week.weekNumber : null;
  const championId = seasonChampion(season.leaderboard, played, MAX_WEEK_NUMBER);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 pb-8">
      <AppHeader
        title="Leaderboard"
        sub={
          shown
            ? `${season.season.year} · Week ${shown.week.weekNumber} · ${shown.complete ? "Final" : "In progress"}`
            : `${season.season.year} · ${seasonStatusLabel(latest)}`
        }
        right={<MemberMenu member={member} group={<GroupSwitcher choice={choice} />} manage={await currentManageHref()} />}
      />

      {/* Plain links, as on the week results screen: a GET per view, nothing
          to hydrate, and the one on screen is the one the URL names. */}
      {played.length > 0 ? (
        <nav aria-label="Standings" className="flex flex-wrap gap-2 px-4">
          {[null, ...played.map((w) => w.week.weekNumber)].map((number) => {
            const here = (shown?.week.weekNumber ?? null) === number;
            return (
              <Link
                key={number ?? "season"}
                href={number === null ? "/leaderboard" : `/leaderboard?week=${number}`}
                aria-current={here ? "page" : undefined}
                className={`flex min-h-tap items-center rounded-full border px-3 text-sm font-bold no-underline ${
                  here ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground"
                }`}
              >
                {number === null ? "Season" : `Week ${number}`}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <section className="px-4">
        {shown ? (
          <>
            <WeeklyScoreList
              scores={shown.scores}
              winners={new Set(shown.weeklyWin?.winners.map((m) => m.id) ?? [])}
              viewerId={member.id}
              guessers={new Set()}
            />
            {won ? <p className="pt-3 text-sm text-muted-foreground">{won}.</p> : null}
          </>
        ) : (
          <>
            <LeaderboardTable rows={season.leaderboard} viewerId={member.id} championId={championId} />
            {movedSince ? (
              <p className="pt-3 text-sm text-muted-foreground">Arrows are places moved since Week {movedSince}.</p>
            ) : null}
          </>
        )}
      </section>

      <div className="flex flex-col px-4">
        <Link href="/rules" className="tap inline-flex items-center text-sm font-semibold underline underline-offset-4">
          How scoring and ties work
        </Link>
        <Link href="/history" className="tap inline-flex items-center text-sm font-semibold underline underline-offset-4">
          See week-by-week history
        </Link>
      </div>
    </main>
  );
}
