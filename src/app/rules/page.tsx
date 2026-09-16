import Link from "next/link";
import { Clock, Eye, ListChecks, Lock, Radio, Scale, Trophy, Users } from "lucide-react";
import { db } from "@/db";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MemberChip } from "@/components/member-chip";
import { SECTION_LABEL } from "@/components/section-label";
import { currentManageHref } from "@/lib/groups/current";
import { requireMember } from "@/lib/members/current";
import { activeSeason, deadlinePassed, publishedSlate } from "@/lib/slate/slate";

/**
 * How to play: making picks, the Lock of the Week, the Tiebreaker Guess, the
 * Deadline, the Reveal, scoring — read from the active season's stored Rules
 * rather than written as copy, so a Lock multiplier or points value that
 * changes for a season shows up here without a code change — and the Live
 * Board. First-time setup lands here too (`?setup=1`), between choosing a
 * name and pennant and adding the app to the home screen, so it stays outside
 * the `(member)` group and draws its own `BottomNav` — like welcome and
 * install, a first-time visit has nowhere else to go yet, and the setup
 * variant omits the nav entirely. A returning member reaches the same page
 * from the header's Rules icon, nav included.
 */
export default async function HowToPlay({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  const member = await requireMember();
  const { setup } = await searchParams;
  const inSetup = setup === "1";
  const database = db();
  const season = await activeSeason(database);
  const { pointsPerCorrectPick, lockMultiplier, tiebreakOrder } = season.rules;
  const slate = inSetup ? null : await publishedSlate(database);
  const locked = slate ? deadlinePassed(slate.week, new Date()) : false;

  return (
    <>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 pb-8">
        <AppHeader
          title="How to play"
          sub={`${season.year} season`}
          manage={await currentManageHref()}
          right={<MemberChip member={member} />}
        />

        <Card asChild className="mx-4 gap-1">
          <section>
            <p className={SECTION_LABEL}>
              <ListChecks size={12} className="mr-1 inline" aria-hidden />
              Making picks
            </p>
            <p className="text-muted-foreground">
              One game at a time. Tap a team &mdash; straight up, not against the spread &mdash; and the pick is saved
              the moment you tap it; there&rsquo;s no submit step.
            </p>
          </section>
        </Card>

        <Card asChild className="mx-4 gap-1">
          <section>
            <p className={SECTION_LABEL}>
              <Lock size={12} className="mr-1 inline" aria-hidden />
              Lock of the Week
            </p>
            <p>
              <span className="font-display text-2xl">{lockMultiplier}×</span>{" "}
              <span className="text-muted-foreground">
                points on the one pick a member marks each week. Nothing extra if it loses.
              </span>
            </p>
          </section>
        </Card>

        <Card asChild className="mx-4 gap-1">
          <section>
            <p className={SECTION_LABEL}>
              <Scale size={12} className="mr-1 inline" aria-hidden />
              Tiebreaker Guess
            </p>
            <p className="text-muted-foreground">
              Predict the combined final score of the week&rsquo;s flagged Tiebreaker Game. If a Weekly Win ties,
              whoever&rsquo;s guess lands closest breaks it; a tie that survives that is shared.
            </p>
          </section>
        </Card>

        <Card asChild className="mx-4 gap-1">
          <section>
            <p className={SECTION_LABEL}>
              <Clock size={12} className="mr-1 inline" aria-hidden />
              Deadline
            </p>
            <p className="text-muted-foreground">
              Picks lock at the Deadline, usually the earliest kickoff on the week&rsquo;s Slate. Make your Lock and
              Tiebreaker Guess before then too &mdash; nothing entered after counts.
            </p>
          </section>
        </Card>

        <Card asChild className="mx-4 gap-1">
          <section>
            <p className={SECTION_LABEL}>
              <Eye size={12} className="mr-1 inline" aria-hidden />
              Reveal
            </p>
            <p className="text-muted-foreground">
              Once the Deadline passes, every pick becomes visible &mdash; yours and everyone else&rsquo;s. Before that,
              no one can see what you&rsquo;ve chosen.
            </p>
          </section>
        </Card>

        <Card asChild className="mx-4 gap-2">
          <section>
            <p className={SECTION_LABEL}>
              <Trophy size={12} className="mr-1 inline" aria-hidden />
              Scoring
            </p>
            <p>
              <span className="font-display text-2xl">{pointsPerCorrectPick}</span>{" "}
              <span className="text-muted-foreground">points for every correct pick.</span>
            </p>
            <p className="text-muted-foreground">{tiebreakOrder}</p>
          </section>
        </Card>

        <Card asChild className="mx-4 gap-1">
          <section>
            <p className={SECTION_LABEL}>
              <Radio size={12} className="mr-1 inline" aria-hidden />
              Live Board
            </p>
            <p className="text-muted-foreground">
              The Saturday view of the Slate: live scores and everyone&rsquo;s picks, colored by whether they&rsquo;re
              currently winning.
            </p>
          </section>
        </Card>

        <Card asChild className="mx-4 gap-1">
          <section>
            <p className={SECTION_LABEL}>
              <Users size={12} className="mr-1 inline" aria-hidden />
              Who you see
            </p>
            <p className="text-muted-foreground">
              Every screen shows one group: its leaderboard, its weekly winner, its board on
              Saturday. You only ever see the people in the group you&rsquo;re looking at, and they
              only ever see you. Your picks are your own &mdash; make them once and they count in
              every group you&rsquo;re in.
            </p>
          </section>
        </Card>

        {inSetup ? (
          <div className="mt-auto px-4 pt-4">
            <Button asChild size="lg" className="w-full">
              <Link href="/install">Next</Link>
            </Button>
          </div>
        ) : (
          <Link href="/" className="mx-4 text-sm font-semibold underline underline-offset-4">
            Back to this week
          </Link>
        )}
      </main>
      {inSetup ? null : <BottomNav locked={locked} />}
    </>
  );
}
