import { redirect } from "next/navigation";
import { db } from "@/db";
import { requireMember } from "@/lib/members/current";
import { toSheetJson } from "@/lib/picks/json";
import { pickSheet } from "@/lib/picks/picks";
import { publishedSlate } from "@/lib/slate/slate";
import { NoSlate } from "./no-slate";
import { PickFlow } from "./pick-flow";

/**
 * Pick entry: one game per screen. Opens at the first unpicked game, or at
 * `?game=<id>` when the review screen sends the member back to change one.
 * Once the Deadline has passed there is nothing to enter, so it goes to review.
 */
export default async function Picks({ searchParams }: { searchParams: Promise<{ game?: string }> }) {
  const member = await requireMember();
  const slate = await publishedSlate(db());
  if (!slate) return <NoSlate />;
  const sheet = await pickSheet(db(), member, slate.week.id);
  if (sheet.locked) redirect("/picks/review");
  const { game } = await searchParams;
  const startGameId = typeof game === "string" ? Number(game) : undefined;
  return <PickFlow sheet={toSheetJson(sheet)} startGameId={startGameId} />;
}
