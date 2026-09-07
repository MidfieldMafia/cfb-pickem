import type { WeeklyScore } from "@/lib/results/results";
import { record, type Standing } from "@/lib/results/summary";

/**
 * The member's own week at a glance: where they stand, what they have scored,
 * and their record. The results screen shows it settled; the Live Board shows
 * it moving, from the same shapes.
 */
export function YourWeek({
  weekNumber,
  score,
  place,
}: {
  weekNumber: number;
  score: WeeklyScore;
  place: Standing;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-primary p-3 text-primary-foreground">
      <div className="min-w-0">
        {/* The caps label from the type scale, in the card's own ink: the rust
            section label is for the paper, not for pine. */}
        <p className="text-xs font-bold uppercase tracking-[0.08em] opacity-80">You · Week {weekNumber}</p>
        <p className="font-display text-xl font-black">{place.label}</p>
      </div>
      <div className="text-right">
        <p className="font-display text-2xl font-black tabular-nums">{score.points} pts</p>
        <p className="text-sm opacity-80">{record(score.correct, score.incorrect)} this week</p>
      </div>
    </div>
  );
}
