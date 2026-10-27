import { Trophy } from "lucide-react";
import { Badge, Card } from "@saturday-slate/design-system";

import { Pennant } from "@/components/pennant";
import type { WeeklyScore } from "@/lib/results/json";
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
 *
 * With `showMax`, while the Week still has games to play, each row carries the
 * most that member can still finish on in a Max column after their points, and
 * a caps header row names the three figures (#488, board A). A member who sat
 * the Week out has no Picks to come in, so their max is 0. Once the Week is
 * complete the max equals the points: the column and its header go, and the
 * list is as it was.
 */
export function WeeklyScoreList({
  scores,
  winners,
  viewerId,
  guessers,
  showMax,
}: {
  scores: WeeklyScore[];
  /** The member ids the Weekly Win went to; more than one when it was shared. */
  winners: Set<number>;
  viewerId: number;
  /** The member ids tied for first by points, whose Guesses are shown; empty when one member led outright. */
  guessers: Set<number>;
  /** Show each member's max possible Weekly Score: true while the Week is not complete. */
  showMax: boolean;
}) {
  return (
    <Card className="gap-0 overflow-hidden p-0">
      {showMax ? (
        // The figures' names, for the eye; a screen reader hears each cell's own label.
        <div
          aria-hidden
          className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground"
        >
          <span className="flex-1" />
          <span className="w-9 text-right">W–L</span>
          <span className="w-10 text-right">Pts</span>
          <span className="w-8 text-right">Max</span>
        </div>
      ) : null}
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
            {/* Fixed widths while the header is up, so each figure sits under its name. */}
            <span className={`text-sm text-muted-foreground tabular-nums ${showMax ? "w-9 text-right" : ""}`}>
              {record(score.correct, score.incorrect)}
            </span>
            <span className="w-10 text-right font-display text-lg font-black tabular-nums">{score.points}</span>
            {showMax ? (
              <span className="w-8 text-right text-sm font-semibold text-muted-foreground tabular-nums">
                <span className="sr-only">max </span>
                {score.maxPoints}
              </span>
            ) : null}
          </li>
        );
      })}
      </ul>
    </Card>
  );
}
