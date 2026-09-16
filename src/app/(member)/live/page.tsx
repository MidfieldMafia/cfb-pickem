import { db } from "@/db";
import { GroupSwitcher } from "@/components/group-switcher";
import { NoGroup } from "@/components/no-group";
import { cfbd } from "@/lib/cfbd";
import { currentGroupChoice, currentManageHref } from "@/lib/groups/current";
import { requireMember } from "@/lib/members/current";
import { toMemberJson } from "@/lib/slate/json";
import { toWeekStateJson } from "@/lib/week/json";
import { currentWeek } from "@/lib/week/week";
import { NoSlate } from "../picks/no-slate";
import { LiveBoard } from "./live-board";

/**
 * The Live Board: the Saturday view of the Slate with live scores and, once
 * the Deadline has passed, every member's pick on each side coloured by
 * whether that side is winning. Rendered once here from the same read the
 * state endpoint answers, then kept fresh by the screen's own polling.
 */
export default async function Live() {
  const member = await requireMember();
  const choice = await currentGroupChoice();
  if (choice === null) return <NoGroup member={member} />;
  const week = await currentWeek(db(), member, new Date(), {
    graded: true,
    season: true,
    cfbd,
    group: choice.current.id,
  });
  if (!week) return <NoSlate />;
  return (
    <LiveBoard
      initial={toWeekStateJson(week)}
      viewer={toMemberJson(member)}
      manage={await currentManageHref()}
      switcher={<GroupSwitcher choice={choice} />}
    />
  );
}
