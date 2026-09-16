import { AppHeader } from "@/components/app-header";
import { MemberChip } from "@/components/member-chip";
import { SECTION_LABEL } from "@/components/section-label";
import { Card } from "@/components/ui/card";
import type { Member } from "@/db/schema";
import { currentManageHref } from "@/lib/groups/current";

/**
 * Where a signed-in member with no group lands. Every board screen shows only
 * one group, so a member in none has nothing to show — and an empty Leaderboard
 * would read as "you are losing to nobody" rather than "you are not set up yet".
 *
 * Deliberately has no way out yet: starting a group and Join Links arrive with
 * their own ticket, and a button that went nowhere would be worse than a
 * sentence that explains the state.
 */
export async function NoGroup({ member }: { member: Member }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 pb-8">
      <AppHeader
        title="Saturday Slate"
        manage={await currentManageHref()}
        right={<MemberChip member={member} />}
      />
      <Card asChild className="mx-4 gap-2">
        <section>
          <p className={SECTION_LABEL}>You&rsquo;re not in a group yet</p>
          <p className="text-muted-foreground">
            A group is who you play against: its own leaderboard, its own weekly winner. Ask whoever
            runs yours for their join link, and this is where their boards will be.
          </p>
          <p className="text-muted-foreground">
            Your picks are still yours &mdash; they count in every group you join.
          </p>
        </section>
      </Card>
    </main>
  );
}
