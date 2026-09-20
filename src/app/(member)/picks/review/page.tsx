import { db } from "@/db";
import { requireMember } from "@/lib/members/current";
import { toSheetJson } from "@/lib/picks/json";
import { currentWeek } from "@/lib/week/week";
import { NoSlate } from "../no-slate";
import { Review } from "./review";

/** Every pick on one screen, plus the Lock of the Week and the Tiebreaker Guess. */
export default async function ReviewPage() {
  const member = await requireMember();
  const week = await currentWeek(db(), member);
  if (!week) return <NoSlate />;
  return <Review initial={toSheetJson(week.sheet)} />;
}
