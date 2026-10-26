import { redirect } from "next/navigation";
import { db } from "@/db";
import { requireMember } from "@/lib/members/current";
import { toSheetJson } from "@/lib/picks/json";
import { onboardingApplies } from "@/lib/push/ask";
import { pushConfigFromEnv } from "@/lib/push/sender";
import { reminderSwitch } from "@/lib/push/settings";
import type { WalkPage } from "@/lib/picks/walk";
import { currentWeek } from "@/lib/week/week";
import { NoSlate } from "./no-slate";
import { PickFlow } from "./pick-flow";

/**
 * Pick entry: one game per screen. Opens at the first unpicked game, or at
 * `?game=<id>` when the review screen sends the member back to change one, or
 * on the Lock or Guess page with `?step=lock|guess`, which Review's rows use.
 * Once the Deadline has passed there is nothing to enter, so it goes to review.
 * So does `?step=lock` on a slate with no game to put a Lock on, as Skip for
 * now would from that page: it could only show an empty list.
 */
export default async function Picks({
  searchParams,
}: {
  searchParams: Promise<{ game?: string; step?: string }>;
}) {
  const member = await requireMember();
  const week = await currentWeek(db(), member);
  if (!week) return <NoSlate tour="picks-screen" />;
  if (week.sheet.locked) redirect("/picks/review");
  const { game, step } = await searchParams;
  if (step === "lock" && !week.sheet.progress.lockApplies) redirect("/picks/review");
  const startGameId = typeof game === "string" ? Number(game) : undefined;
  const startPage: WalkPage | undefined = step === "lock" || step === "guess" ? step : undefined;
  // What the browser can't know for the Pick reminder ask (#482).
  const reminder = {
    on: reminderSwitch(member).on,
    publicKey: pushConfigFromEnv()?.publicKey ?? null,
    onboarding: onboardingApplies(member.welcomedAt, new Date()),
  };
  return <PickFlow sheet={toSheetJson(week.sheet)} startGameId={startGameId} startPage={startPage} reminder={reminder} />;
}
