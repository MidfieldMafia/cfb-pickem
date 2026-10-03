import Link from "next/link";
import { ChevronDown, Clock, Target, Trophy } from "lucide-react";
import { db } from "@/db";
import { AppHeader, Button, Card, SECTION_LABEL, LINK } from "@saturday-slate/design-system";

import { BottomNav } from "@/components/bottom-nav";
import { currentChatUnread } from "@/lib/chat/current";

import { MemberMenu } from "@/components/member-menu";

import { currentManageHref } from "@/lib/groups/current";
import { requireMember } from "@/lib/members/current";
import { safeInteger } from "@/lib/parse";
import { picksOpenFor } from "@/lib/picks/picks";
import { activeSeason, deadlinePassed, publishedSlate } from "@/lib/slate/slate";

/**
 * How to play: the rules and nothing else — where things are on screen is the
 * Welcome Tour's job. Points and the Lock multiplier are read from the active
 * season's stored Rules rather than written as copy, so a value that changes
 * for a season shows up here without a code change. First-time setup lands
 * here too (`?setup=1`), between choosing a name and pennant and adding the
 * app to the home screen, so it stays outside the `(member)` group and draws
 * its own `BottomNav` — like welcome and install, a first-time visit has
 * nowhere else to go yet, and the setup variant omits the nav entirely. A
 * founder who just started a group (`&group=<id>`) goes on to its organizer
 * screen rather than straight to install. A returning member reaches the same
 * page from the header's Rules icon, nav included.
 */
export default async function HowToPlay({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string; group?: string }>;
}) {
  const member = await requireMember();
  const { setup, group } = await searchParams;
  const inSetup = setup === "1";
  // Someone who just started a group sees the organizer screen before the
  // install steps; that screen checks they run the group, so the id is not trusted here.
  const started = group ? safeInteger(group) : null;
  const next = started === null ? "/install" : `/start/${started}?setup=1`;
  const database = db();
  const season = await activeSeason(database);
  const { pointsPerCorrectPick, lockMultiplier } = season.rules;
  const slate = inSetup ? null : await publishedSlate(database);
  const locked = slate ? deadlinePassed(slate.week, new Date()) : false;
  const picksOpen = slate && !locked ? await picksOpenFor(database, member, slate) : false;
  const chatUnread = inSetup ? 0 : await currentChatUnread(member);

  return (
    <>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 pb-8">
        <AppHeader
          title="How to play"
          sub={`${season.year} season`}
          right={<MemberMenu member={member} manage={await currentManageHref()} />}
        />

        <div className="flex flex-col gap-3 px-4">
          <p className="mb-1 text-base">Pick the winner of every game. Straight up, no spread.</p>

          <div className="grid grid-cols-2 gap-2">
            <NumberTile value={`${pointsPerCorrectPick}`} label="points" note="for each correct pick" />
            <NumberTile value={`${lockMultiplier}×`} label="Lock of the Week" note="on one game you choose" />
          </div>

          <Card asChild className="flex-row items-center">
            <section>
              <Target size={28} className="shrink-0 text-secondary" aria-hidden />
              <TitleAndNote
                title="Tiebreaker Guess"
                note="Guess the total points in one designated game. Closest guess wins a tied week."
              />
            </section>
          </Card>

          <Card asChild className="flex-row items-center border-transparent bg-primary text-primary-foreground">
            <section>
              <Clock size={28} className="shrink-0" aria-hidden />
              <div className="flex flex-col">
                <p className="font-display text-lg leading-6">Picks lock at the first kickoff</p>
                <p className="text-sm opacity-85">
                  That&rsquo;s the Deadline, for your Lock and guess too. Then everyone&rsquo;s picks show.
                </p>
              </div>
            </section>
          </Card>

          <Card asChild>
            <section>
              <div className="flex items-center gap-3">
                <Trophy size={28} className="shrink-0 text-secondary" aria-hidden />
                <TitleAndNote title="Leaderboard" note="The season is decided by these, in order." />
              </div>
              <ol className="flex flex-col gap-1.5">
                {LEADERBOARD_ORDER.map((step, i) => (
                  <li key={step} className="flex items-center gap-2.5">
                    <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-muted text-xs font-bold">
                      {i + 1}
                    </span>
                    <span className="text-muted-foreground">{step}</span>
                  </li>
                ))}
              </ol>
            </section>
          </Card>

          {/* The rows carry their own 48px height, so the card drops its
              vertical padding and only the label gets space above it. */}
          <Card asChild className="gap-0 py-0">
            <section>
              <p className={`pt-3 pb-1 ${SECTION_LABEL}`}>Good to know</p>
              {GOOD_TO_KNOW.map(({ title, body }) => (
                <details key={title} className="group border-b border-muted last:border-b-0">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between font-bold [&::-webkit-details-marker]:hidden">
                    {title}
                    <ChevronDown size={16} className="shrink-0 group-open:rotate-180" aria-hidden />
                  </summary>
                  <p className="mb-3 text-muted-foreground">{body}</p>
                </details>
              ))}
            </section>
          </Card>
        </div>

        {inSetup ? (
          <div className="mt-auto px-4 pt-4">
            <Button asChild size="lg" className="w-full">
              <Link href={next}>Next</Link>
            </Button>
          </div>
        ) : (
          <Link href="/" className={`mx-4 ${LINK}`}>
            Back to this week
          </Link>
        )}
      </main>
      {inSetup ? null : <BottomNav locked={locked} picksOpen={picksOpen} chatUnread={chatUnread} />}
    </>
  );
}

/**
 * How the Leaderboard orders the season, most significant first: the order
 * `compareSeason` (src/lib/scoring/score-season.ts) applies. Written here
 * rather than read from Rules because the comparator is fixed code, so a
 * stored order could only ever drift from it; a change to one is carried to
 * the other by hand.
 */
const LEADERBOARD_ORDER = ["Total points", "Weekly wins", "Closest Tiebreaker Guesses"];

/** The "Good to know" rows, in order; each opens and closes without client JS. */
const GOOD_TO_KNOW = [
  {
    title: "Changing picks",
    body: "Change any pick, your Lock or your guess until the Deadline. A Lock that loses costs nothing.",
  },
  {
    title: "Missing a week",
    body: "A week with no picks doesn’t count. You score nothing, and your record is untouched.",
  },
  {
    title: "Canceled games",
    body: "A canceled or postponed game counts for no one. A Lock on it drops, and you can move it before the Deadline.",
  },
  {
    title: "More than one group",
    body: "You see one group at a time. Your picks count in every group you’re in.",
  },
];

function NumberTile({ value, label, note }: { value: string; label: string; note: string }) {
  return (
    <Card className="gap-0.5">
      <span className="font-display text-[40px] leading-[44px]">{value}</span>
      <span className="font-bold">{label}</span>
      <span className="text-sm text-muted-foreground">{note}</span>
    </Card>
  );
}

function TitleAndNote({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-bold">{title}</span>
      <span className="text-sm text-muted-foreground">{note}</span>
    </div>
  );
}
