import Link from "next/link";
import { db } from "@/db";
import { AppHeader, Card, SECTION_LABEL } from "@saturday-slate/design-system";

import { GroupSwitcher } from "@/components/group-switcher";
import { MemberChip } from "@/components/member-chip";
import { NoGroup } from "@/components/no-group";

import { currentGroupChoice, currentManageHref } from "@/lib/groups/current";
import { requireMember } from "@/lib/members/current";
import { seasonResult } from "@/lib/results/results";
import { weeklyWinSentence } from "@/lib/results/summary";

/**
 * Every settled Week, most recent first — the list `leaderboard/page.tsx`
 * used to render inline before #91/#115 gave it a tab of its own.
 *
 * `seasonResult`'s `weeks` gates on the Deadline, not on every game being
 * final, so a Week still in progress after its Deadline belongs to the Live
 * Board, not here — filtering on `complete` is what keeps the two from ever
 * claiming the same Week at once.
 */
export default async function History() {
  const member = await requireMember();
  const choice = await currentGroupChoice();
  if (choice === null) return <NoGroup member={member} />;
  const season = await seasonResult(db(), choice.current.id, new Date());
  const played = season.weeks.filter((week) => week.complete);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 pb-8">
      <AppHeader
        title="History"
        group={<GroupSwitcher choice={choice} />}
        sub={`${season.season.year} season`}
        manage={await currentManageHref()}
        right={<MemberChip member={member} />}
      />

      {played.length > 0 ? (
        <section className="space-y-2 px-4">
          <p className={SECTION_LABEL}>Settled weeks</p>
          <Card asChild className="gap-0 overflow-hidden p-0">
            <ul className="divide-y divide-border">
            {[...played].reverse().map((week) => {
              const won = weeklyWinSentence(week.weeklyWin, week.complete);
              return (
                <li key={week.week.id}>
                  <Link
                    href={`/history/results?week=${week.week.weekNumber}`}
                    className="flex min-h-tap items-center justify-between gap-3 p-3 no-underline"
                  >
                    <span className="font-semibold">Week {week.week.weekNumber}</span>
                    <span className="truncate text-sm text-muted-foreground">
                      {won ?? "Nobody played this week"}
                    </span>
                  </Link>
                </li>
              );
            })}
            </ul>
          </Card>
        </section>
      ) : (
        <Card asChild className="mx-4 gap-2">
          <section>
            <p className={SECTION_LABEL}>Nothing settled yet</p>
            <p className="text-muted-foreground">
              A week lands here once its deadline has passed and every one of its games is final.
            </p>
          </section>
        </Card>
      )}
    </main>
  );
}
