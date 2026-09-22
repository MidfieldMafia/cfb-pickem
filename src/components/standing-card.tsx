import { Card } from "@saturday-slate/design-system";

import type { WeeklyScore } from "@/lib/results/results";
import { record, type SeasonStanding } from "@/lib/results/summary";

/**
 * The pine card at the top of a member screen: a caps label with the place
 * under it, and the figure with its note on the right.
 *
 * It does not decide its own wording: callers hand it strings that
 * `summary.ts` built.
 */
function StandingCard({
  label,
  place,
  figure,
  note,
}: {
  label: string;
  place: string;
  figure: string;
  note: string;
}) {
  // Pine, so it overrides Card's paper fill and ink. `border-transparent`
  // rather than `border-0`: the card keeps the same 1px box as every other
  // surface, so a pine card and a paper one sitting in one column measure the
  // same width.
  return (
    <Card className="flex-row items-center justify-between border-transparent bg-primary text-primary-foreground">
      <div className="min-w-0">
        {/* The caps label from the type scale, in the card's own ink: the rust
            section label is for the paper, not for pine. */}
        <p className="text-xs font-bold uppercase tracking-[0.08em] opacity-80">{label}</p>
        <p className="font-display text-xl font-black">{place}</p>
      </div>
      <div className="text-right">
        <p className="font-display text-2xl font-black tabular-nums">{figure}</p>
        <p className="text-sm opacity-80">{note}</p>
      </div>
    </Card>
  );
}

/**
 * The member's own season, as the card at the top of the Live Board: the
 * season place and total, with this week's record as the note.
 *
 * The season rather than the week — the one respect in which this card differs
 * from the results screen's, and deliberately so. On a Saturday the season
 * total is the stake and the week's record is the movement; the total already
 * carries this week's provisional points (`playedWeeks` counts a Week from its
 * Deadline), so the figure climbs as games go final.
 */
export function YourSeason({ season, score }: { season: SeasonStanding; score: WeeklyScore }) {
  return (
    <StandingCard
      label="You · Season"
      place={season.label}
      figure={`${season.points} pts`}
      note={`${record(score.correct, score.incorrect)} this week`}
    />
  );
}
