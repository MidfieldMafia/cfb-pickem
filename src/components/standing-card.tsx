import type { WeeklyScore } from "@/lib/results/results";
import { record, type SeasonStanding, type Standing } from "@/lib/results/summary";

/**
 * The pine card at the top of a member screen: a caps label with the place
 * under it, and the figure with its note on the right.
 *
 * One shell for the two cards that use it — the week the results screen shows
 * settled, and the season the Live Board shows moving — so the pair cannot
 * drift in type scale or in ink. Neither card decides its own wording: both
 * hand it strings that `summary.ts` built.
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
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-primary p-3 text-primary-foreground">
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
    </div>
  );
}

/**
 * The member's own week at a glance: where they placed in it, what they
 * scored, and their record. What the results screen shows, settled.
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
    <StandingCard
      label={`You · Week ${weekNumber}`}
      place={place.label}
      figure={`${score.points} pts`}
      note={`${record(score.correct, score.incorrect)} this week`}
    />
  );
}

/**
 * The member's own season, as mockup 05 draws the card at the top of the Live
 * Board: the season place and total, with this week's record as the note.
 *
 * The season rather than the week — the one respect in which this card differs
 * from the results screen's, and deliberately so, because mockup 06 draws the
 * week in this slot and 05 draws the season. On a Saturday the season total is
 * the stake and the week's record is the movement; the total already carries
 * this week's provisional points (`playedWeeks` counts a Week from its
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
