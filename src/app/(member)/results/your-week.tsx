import { Check, Lock, LockOpen, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LocalTime } from "@/components/local-time";
import type { RevealPick } from "@/lib/results/results";
import type { BreakdownRow } from "@/lib/results/summary";
import { isVoid, teamName, voidNote, type GameView } from "@/lib/slate/json";

/** The team the member took, graded. Outline for a Game with nothing settled yet. */
function PickChip({ view, pick }: { view: GameView; pick: RevealPick | null }) {
  if (pick === null) return <Badge variant="outline">No pick</Badge>;
  const team = teamName(view.game, pick.teamId);
  const lock =
    pick.lock === "counts" ? (
      <Lock size={12} aria-label="Lock of the Week" />
    ) : pick.lock === "dropped" ? (
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
