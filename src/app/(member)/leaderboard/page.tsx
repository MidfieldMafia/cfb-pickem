import Link from "next/link";
import { db } from "@/db";
import { AppHeader, LINK } from "@saturday-slate/design-system";

import { cfbd } from "@/lib/cfbd";
import { GroupSwitcher } from "@/components/group-switcher";
import { MemberMenu } from "@/components/member-menu";
import { NoGroup } from "@/components/no-group";
import { currentGroupChoice, currentManageHref } from "@/lib/groups/current";
import { requireMember } from "@/lib/members/current";
import { effectiveResult, seasonResult } from "@/lib/results/results";
import { seasonChampion, seasonStatusLabel, weeklyWinners, weeklyWinSentence } from "@/lib/results/summary";
import { MAX_WEEK_NUMBER } from "@/lib/slate/slate";
import { freshSlate } from "@/lib/week/week";
import { LeaderboardTable } from "./leaderboard-table";
import { gamesLeftLabel, revealHref, selectedWeek, stripTiles, weekInProgress } from "./week-view";
import { LiveWeekCard, RevealCard, WeekStrip } from "./week-strip";
import { WeeklyScoreList } from "./weekly-score";

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
 * feeds cannot disagree, and choosing a week costs no further query. Without
 * one — or with a Week that has not been played — it opens on the Week in
 * progress while there is one, and on Season otherwise (#243);
 * `?week=season` asks for Season outright. A finished Week ends in a card to
 * its Reveal (#244), which has a screen of its own at `reveal/`.
 *
 * While a Week is in progress the feed is pulled first, on the Live Board's
 * stale gate, so the standings and the games-left card read the same scores.
 */
export default async function Leaderboard({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const member = await requireMember();
  const choice = await currentGroupChoice();
  if (choice === null) return <NoGroup member={member} />;
  const now = new Date();
  const slate = await freshSlate(db(), cfbd, now);
  const season = await seasonResult(db(), choice.current.id, now);
  const played = season.weeks;
  const latest = played[played.length - 1];
  const { week: requested } = await searchParams;
  const shown = selectedWeek(played, requested);
  const going = weekInProgress(played);
  // The games are the published Slate's, which is the Week in progress
  // whenever there is one: only the latest played Week can be.
  const left =
    shown !== null && shown === going && slate?.week.id === going.week.id
      ? gamesLeftLabel(slate.games.map(effectiveResult))
      : "";
  // Null when nobody played the Week, which is not the same as an empty
  // sentence: interpolating it straight into the footnote puts "null" on the board.
  const won = shown ? weeklyWinSentence(shown.weeklyWin, shown.complete) : null;
  const reveal = revealHref(shown);
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

      {played.length > 0 ? (
        <WeekStrip
          tiles={stripTiles({
            year: season.season.year,
            played,
            leaderboard: season.leaderboard,
            viewerId: member.id,
            shown,
          })}
        />
      ) : null}

      {left ? (
        <div className="px-4">
          <LiveWeekCard left={left} />
        </div>
      ) : null}

      <section className="px-4">
        {shown ? (
          <>
            <WeeklyScoreList
              scores={shown.scores}
              winners={weeklyWinners(shown.weeklyWin, shown.complete)}
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

      {shown && reveal ? (
        <div className="px-4">
          <RevealCard href={reveal} weekNumber={shown.week.weekNumber} />
        </div>
      ) : null}

      <div className="flex flex-col px-4">
        <Link href="/rules" className={LINK}>
          How scoring and ties work
        </Link>
      </div>
    </main>
  );
}
