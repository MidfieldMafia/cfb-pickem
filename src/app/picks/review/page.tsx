import { db } from "@/db";
import { requireMember } from "@/lib/members/current";
import { toSheetJson } from "@/lib/picks/json";
import { pickSheet } from "@/lib/picks/picks";
import { publishedSlate } from "@/lib/slate/slate";
import { NoSlate } from "../no-slate";
import { Review } from "./review";

/** Every pick on one screen, plus the Lock of the Week and the Tiebreaker Guess. */
export default async function ReviewPage() {
  const member = await requireMember();
  const slate = await publishedSlate(db());
  if (!slate) return <NoSlate />;
  const sheet = await pickSheet(db(), member, slate.week.id);
  return <Review initial={toSheetJson(sheet)} />;
}
