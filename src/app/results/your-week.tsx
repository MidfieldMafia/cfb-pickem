import { Check, Lock, LockOpen, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LocalTime } from "@/components/local-time";
import type { RevealPick, WeeklyScore } from "@/lib/results/results";
import { record, type BreakdownRow, type Standing } from "@/lib/results/summary";
import { isVoid, teamName, voidNote, type GameView } from "@/lib/slate/json";

/** The member's own week at a glance: where they came, what they scored, and their record. */
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

/** The team the member took, graded. Outline for a Game with nothing settled yet. */
function PickChip({ view, pick }: { view: GameView; pick: RevealPick | null }) {
  if (pick === null) return <Badge variant="outline">No pick</Badge>;
  const team = teamName(view.game, pick.teamId);
  const lock = pick.locked ? (
    <Lock size={12} aria-label="Lock of the Week" />
  ) : pick.lockDropped ? (
    <LockOpen size={12} aria-label="Lock of the Week, dropped: the game is void" />
  ) : null;
  if (pick.outcome === "correct") {
    return (
      <Badge className="bg-win text-win-foreground">
        <Check strokeWidth={3} /> {team} {lock}
      </Badge>
    );
  }
  if (pick.outcome === "incorrect") {
    return (
      <Badge className="bg-loss text-loss-foreground">
        <X strokeWidth={3} /> {team} {lock}
      </Badge>
    );
  }
  // Pending and void both read as "nothing settled here", and the line beneath
  // the matchup already says which: "Scheduled", "In progress", "Void".
  return (
    <Badge variant="outline">
      {team} {lock}
    </Badge>
  );
}

/**
 * The member's own Week, game by game: what a member browsing their past
 * weeks came for. Transposed out of the Reveal by `pickBreakdown`, so it is
 * the same grading the board above it shows, read along the other axis.
 */
export function YourPicks({
  rows,
  tiebreakerGuess,
}: {
  rows: BreakdownRow[];
  tiebreakerGuess: number | null;
}) {
  return (
    <ul className="divide-y divide-border rounded-md border border-border bg-card">
      {rows.map(({ game, pick, tiebreaker }) => {
        const { result } = game;
        const why = voidNote(game);
        return (
          <li key={game.game.id} className={`space-y-1 p-3 ${isVoid(game) ? "opacity-70" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {/* Wraps rather than truncates: "Mississippi State at Minnesota"
                    is 204px against 195px of room at 390px wide, and a clipped
                    matchup is the one thing this row exists to say. */}
                <p className="text-sm font-semibold">
                  {game.game.awayTeam} at {game.game.homeTeam}
                </p>
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>{result.label}</span>
                  {result.shown ? (
                    <span className="tabular-nums">
                      {result.shown.awayScore}–{result.shown.homeScore}
                    </span>
                  ) : (
                    <LocalTime at={game.game.kickoff} style="slot" />
                  )}
                  {why ? <span>· {why}</span> : null}
                </p>
              </div>
              <PickChip view={game} pick={pick} />
            </div>
            {tiebreaker ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">Tiebreaker</Badge>
                {tiebreakerGuess === null
                  ? "You did not guess this week"
                  : `You guessed ${tiebreakerGuess}`}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
