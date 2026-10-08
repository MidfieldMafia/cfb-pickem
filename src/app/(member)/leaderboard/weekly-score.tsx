import { Trophy } from "lucide-react";
import { Badge, Card } from "@saturday-slate/design-system";

import { Pennant } from "@/components/pennant";
import type { WeeklyScore } from "@/lib/results/results";
import { guessLabel, record } from "@/lib/results/summary";

/**
 * Everyone's Weekly Score in finish order, as the engine sorted it: Played
 * Weeks first, then points, then Tiebreaker Guess closeness. Members level on
 * all three share a place, which is why the place is the engine's `place`
 * rather than the row's index.
 *
 * Only the members tied for first carry a Guess, and only in a Week with a
 * Tiebreaker Game to decide it: theirs are the Guesses that settled the Weekly
 * Win, and a Guess under every row is noise.
 */
export function WeeklyScoreList({
  scores,
  winners,
  viewerId,
  guessers,
}: {
  scores: WeeklyScore[];
  /** The member ids the Weekly Win went to; more than one when it was shared. */
  winners: Set<number>;
  viewerId: number;
  /** The member ids tied for first by points, whose Guesses are shown; empty when one member led outright. */
  guessers: Set<number>;
}) {
  return (
    <Card asChild className="gap-0 overflow-hidden p-0">
      <ul className="divide-y divide-border">
      {scores.map((score) => {
        const you = score.member.id === viewerId;
        return (
          <li
            key={score.member.id}
            className={`flex items-center gap-2 p-3 ${you ? "bg-muted" : ""}`}
          >
            <span className="w-4 text-sm text-muted-foreground tabular-nums">{score.place}</span>
            <Pennant avatarId={score.member.avatarId} name={score.member.displayName} size={28} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-semibold">{score.member.displayName}</span>
                {you ? <span className="text-xs text-muted-foreground">you</span> : null}
              </span>
              {winners.has(score.member.id) ? (
                <Badge variant="leader" className="mt-0.5">
                  <Trophy size={12} aria-hidden /> Weekly Win
                </Badge>
              ) : null}
              {guessers.has(score.member.id) ? (
                <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
                  {guessLabel(score)}
                </span>
              ) : null}
            </span>
            <span className="text-sm text-muted-foreground tabular-nums">
              {record(score.correct, score.incorrect)}
            </span>
            <span className="w-10 text-right font-display text-lg font-black tabular-nums">
              {score.points}
            </span>
          </li>
        );
      })}
      </ul>
    </Card>
  );
}
