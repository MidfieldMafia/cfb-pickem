import { Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Pennant } from "@/components/pennant";
import type { WeeklyScore } from "@/lib/results/results";
import { record, standing } from "@/lib/results/summary";

/**
 * Everyone's Weekly Score in finish order, as the engine sorted it: points,
 * then Tiebreaker Guess closeness. Members level on both share a place, which
 * is why the place comes from `standing` rather than from the row's index.
 */
export function WeeklyScoreList({
  scores,
  winners,
  viewerId,
}: {
  scores: WeeklyScore[];
  /** The member ids the Weekly Win went to; more than one when it was shared. */
  winners: Set<number>;
  viewerId: number;
}) {
  return (
    <ul className="divide-y divide-border rounded-md border border-border bg-card">
      {scores.map((score) => {
        const you = score.member.id === viewerId;
        const place = standing(scores, score.member.id)!.place;
        return (
          <li
            key={score.member.id}
            className={`flex items-center gap-2 p-3 ${you ? "bg-muted" : ""}`}
          >
            <span className="w-4 text-sm text-muted-foreground tabular-nums">{place}</span>
            <Pennant avatarId={score.member.avatarId} size={28} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-semibold">{score.member.displayName}</span>
                {you ? <span className="text-xs text-muted-foreground">you</span> : null}
              </span>
              {winners.has(score.member.id) ? (
                <Badge className="mt-0.5 bg-leader text-leader-foreground">
                  <Trophy size={12} aria-hidden /> Weekly Win
                </Badge>
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
  );
}
