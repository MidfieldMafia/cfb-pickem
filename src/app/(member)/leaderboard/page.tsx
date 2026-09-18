import Link from "next/link";
import { db } from "@/db";
import { AppHeader } from "@/components/app-header";
import { GroupSwitcher } from "@/components/group-switcher";
import { MemberChip } from "@/components/member-chip";
import { NoGroup } from "@/components/no-group";
import { currentGroupChoice, currentManageHref } from "@/lib/groups/current";
import { requireMember } from "@/lib/members/current";
import { seasonResult } from "@/lib/results/results";
import { weeklyWinSentence } from "@/lib/results/summary";
import { LeaderboardTable } from "./leaderboard-table";

/**
 * The season standings, computed on every read: nothing here is stored, so a
 * Result Override on the results console changes this table the next time it
 * is opened.
 *
 * Only Weeks whose Deadline has passed count (`playedWeeks`), so a Week in
 * progress never appears as a week everyone scored zero in.
 */
export default async function Leaderboard() {
  const member = await requireMember();
  const choice = await currentGroupChoice();
  if (choice === null) return <NoGroup member={member} />;
  const season = await seasonResult(db(), choice.current.id, new Date());
  const played = season.weeks;
  const latest = played[played.length - 1];
  // Null when nobody played the latest Week, which is not the same as an empty
  // sentence: interpolating it straight into the footnote puts "null" on the board.
  const won = latest ? weeklyWinSentence(latest.weeklyWin, latest.complete) : null;
  // Movement is measured against the board before the latest played Week. With
  // one week played there is no such board, so there are no arrows to explain.
  const movedSince = played.length > 1 ? played[played.length - 2].week.weekNumber : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 pb-8">
      <AppHeader
        title="Leaderboard"
        group={<GroupSwitcher choice={choice} />}
        sub={
          latest
            ? `${season.season.year} season · after Week ${latest.week.weekNumber}`
            : `${season.season.year} season · before the first week`
        }
        manage={await currentManageHref()}
        right={<MemberChip member={member} />}
      />

      <section className="px-4">
        <LeaderboardTable rows={season.leaderboard} viewerId={member.id} />
        <p className="pt-3 text-sm text-muted-foreground">
          Ties break by Weekly Wins, then by Tiebreaker Guess closeness that week.
          {won ? ` ${won}.` : ""}
          {movedSince ? ` Arrows are places moved since Week ${movedSince}.` : ""}
          {" "}Miss is each member&rsquo;s average Tiebreaker Guess miss across the season and plays no part in ties.
        </p>
      </section>

      <div className="px-4">
        <Link
          href="/history"
          className="tap inline-flex items-center text-sm font-semibold underline underline-offset-4"
        >
          See week-by-week history
        </Link>
      </div>
    </main>
  );
}
