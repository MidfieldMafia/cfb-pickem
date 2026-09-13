import Link from "next/link";
import { Lock, Target, Trophy } from "lucide-react";
import { db } from "@/db";
import { AppHeader } from "@/components/app-header";
import { MemberChip } from "@/components/member-chip";
import { SECTION_LABEL } from "@/components/section-label";
import { requireMember } from "@/lib/members/current";
import { activeSeason } from "@/lib/slate/slate";

/**
 * The Rules a member is subject to, read from the active season's stored
 * Rules rather than written as copy: a Lock multiplier or points value that
 * changes for a season shows up here without a code change.
 */
export default async function Rules() {
  const member = await requireMember();
  const season = await activeSeason(db());
  const { pointsPerCorrectPick, lockMultiplier, tiebreakOrder } = season.rules;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 pb-8">
      <AppHeader
        title="Scoring rules"
        sub={`${season.year} season`}
        commissioner={member.isCommissioner}
        right={<MemberChip member={member} />}
      />

      <section className="mx-4 space-y-1 rounded-md border border-border bg-card p-3">
        <p className={SECTION_LABEL}>
          <Target size={12} className="mr-1 inline" aria-hidden />
          Picks
        </p>
        <p>
          <span className="font-display text-2xl">{pointsPerCorrectPick}</span>{" "}
          <span className="text-muted-foreground">points for every correct pick.</span>
        </p>
      </section>

      <section className="mx-4 space-y-1 rounded-md border border-border bg-card p-3">
        <p className={SECTION_LABEL}>
          <Lock size={12} className="mr-1 inline" aria-hidden />
          Lock of the Week
        </p>
        <p>
          <span className="font-display text-2xl">{lockMultiplier}×</span>{" "}
          <span className="text-muted-foreground">
            points on the one pick a member marks each week. Nothing extra if it loses.
          </span>
        </p>
      </section>

      <section className="mx-4 space-y-2 rounded-md border border-border bg-card p-3">
        <p className={SECTION_LABEL}>
          <Trophy size={12} className="mr-1 inline" aria-hidden />
          Ties
        </p>
        <p className="text-muted-foreground">
          A Weekly Win ties break by whoever&rsquo;s Tiebreaker Guess lands closest to the actual combined score of
          the week&rsquo;s flagged game; a tie that survives that is shared.
        </p>
        <p className="text-muted-foreground">{tiebreakOrder}</p>
      </section>

      <Link href="/week" className="mx-4 text-sm font-semibold underline underline-offset-4">
        Back to this week
      </Link>
    </main>
  );
}
