import Link from "next/link";
import { AppHeader, SECTION_LABEL, Button, Card } from "@saturday-slate/design-system";

import { MemberMenu } from "@/components/member-menu";

import type { Member } from "@/db/schema";
import { currentManageHref } from "@/lib/groups/current";

/**
 * Where a signed-in member with no group lands. Every board screen shows only
 * one group, so a member in none has nothing to show — and an empty Leaderboard
 * would read as "you are losing to nobody" rather than "you are not set up yet".
 *
 * The ways in are a group's Join Link, which arrives from outside the app, and
 * starting a group, which is the button.
 */
export async function NoGroup({ member }: { member: Member }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 pb-8">
      <AppHeader
        title="Saturday Slate"
        right={<MemberMenu member={member} manage={await currentManageHref()} />}
      />
      <Card asChild className="mx-4 gap-2">
        <section>
          <p className={SECTION_LABEL}>You&rsquo;re not in a group yet</p>
          <p className="text-muted-foreground">
            A group is who you play against: its own leaderboard, its own weekly winner. Open the Join
            Link your group shared, or start a group of your own, and this is where its boards will be.
          </p>
          <p className="text-muted-foreground">
            Your picks are still yours &mdash; they count in every group you join.
          </p>
          <Button asChild className="self-start">
            <Link href="/start">Start a group</Link>
          </Button>
        </section>
      </Card>
    </main>
  );
}
