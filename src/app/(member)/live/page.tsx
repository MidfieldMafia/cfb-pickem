import { db } from "@/db";
import { cfbd } from "@/lib/cfbd";
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
  const week = await currentWeek(db(), member, new Date(), { graded: true, cfbd });
  if (!week) return <NoSlate />;
  return <LiveBoard initial={toWeekStateJson(week)} viewer={toMemberJson(member)} />;
}
