import type { Member } from "@/db/schema";
import { GroupSwitcher } from "@/components/group-switcher";
import { MemberMenu } from "@/components/member-menu";
import { currentGroupChoice, currentManageHref } from "@/lib/groups/current";

/**
 * The pennant menu on the Picks screens (#514), the same one Leaderboard
 * opens. `PickFlow` and `Review` are client components, and the group and
 * Manage reads are `server-only`, so each page renders this and passes it down.
 * Picks belong to the member rather than a group, so a member in none still
 * gets the menu, without the group list.
 */
export async function PicksMenu({ member }: { member: Member }) {
  const choice = await currentGroupChoice();
  return (
    <MemberMenu
      member={member}
      group={choice ? <GroupSwitcher choice={choice} /> : undefined}
      manage={await currentManageHref()}
    />
  );
}
