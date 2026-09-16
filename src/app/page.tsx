import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { db } from "@/db";
import { currentGroup } from "@/lib/groups/current";
import { currentMember } from "@/lib/members/current";
import { currentWeek, landingRoute } from "@/lib/week/week";

export default async function Home() {
  const member = await currentMember();
  if (member) {
    // Without the group the Week grades to nothing, and `landingRoute` would
    // read a settled Week as still live and send them to the Live Board.
    const week = await currentWeek(db(), member, new Date(), { graded: true, group: await currentGroup() });
    redirect(landingRoute(week));
  }

  // The headline is a placeholder until the design pass (#140).
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-16 text-center">
      <Wordmark size="lg" />
      <div className="max-w-sm space-y-3">
        <h1>College football pick&rsquo;em for your people</h1>
        <p className="text-muted-foreground">
          Open your personal link or the Join Link your group shared. No passwords, no accounts.
        </p>
      </div>
      <Button asChild size="lg">
        <Link href="/start">Start a group</Link>
      </Button>
    </main>
  );
}
