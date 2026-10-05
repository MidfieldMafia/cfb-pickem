"use client";

import { Scale } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Badge, Button, LocalTime } from "@saturday-slate/design-system";

import { TeamLogo } from "@/components/team-logo";

import { shortSchool } from "@/lib/logos";
import { tiebreakerOverUnder, tiebreakerView, type SheetJson } from "@/lib/picks/json";
import { tiebreakerGuessError } from "@/lib/picks/limits";
import type { ShownPick } from "@/lib/picks/use-pick-sheet";
import { teamName } from "@/lib/slate/json";

import { SKIP } from "./lock-step";

function CardTeam({ team }: { team: string }) {
  return (
    <span className="flex flex-col items-center gap-1">
      <TeamLogo team={team} size={52} />
      <span className="font-display text-base">{shortSchool(team)}</span>
    </span>
  );
}

/**
 * "Your Tiebreaker Guess":the Tiebreaker Game's card, then one large number
 * field. Its placeholder is the over/under, a neutral reference where an
 * example number would anchor the guess. "Save and review" saves and moves
 * on; "Skip for now" moves on and leaves the Guess owed.
 */
export function GuessStep({
  sheet,
  pick,
  locked,
  saving,
  error,
  onSave,
  onSkip,
}: {
  sheet: SheetJson;
  pick: (gameId: number) => ShownPick | undefined;
  locked: boolean;
  saving: boolean;
  /** Why the server refused the last save. */
  error: string | null;
  onSave: (guess: number) => void;
  onSkip: () => void;
}) {
  const [typed, setTyped] = useState(sheet.tiebreakerGuess === null ? "" : String(sheet.tiebreakerGuess));
  const [invalid, setInvalid] = useState<string | null>(null);
  const game = tiebreakerView(sheet)?.game;
  const ownPick = game ? pick(game.id) : undefined;
  const overUnder = tiebreakerOverUnder(sheet);

  const save = (event: FormEvent) => {
    event.preventDefault();
    const value = Number(typed);
    const problem = typed.trim() === "" ? "Enter a guess first." : tiebreakerGuessError(value);
    setInvalid(problem);
    if (!problem) onSave(value);
  };

  const shownError = invalid ?? error;

  return (
    <form onSubmit={save} className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-2 pt-1">
      <h2 className="m-0 font-display text-2xl leading-[30px]">Your Tiebreaker Guess</h2>

      {game ? (
        <section
          aria-label="Tiebreaker Game"
          className="flex flex-col items-center gap-2 rounded-xl border-2 border-secondary bg-card px-3 py-3.5"
        >
          <Badge variant="secondary">
            <Scale size={12} aria-hidden />
            Tiebreaker Game
          </Badge>
          <div className="flex items-center gap-4">
            <CardTeam team={game.awayTeam} />
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">at</span>
            <CardTeam team={game.homeTeam} />
          </div>
          <span className="text-xs text-muted-foreground">
            <LocalTime at={game.kickoff} style="slot" />
            {ownPick?.state === "saved" ? ` · Your pick: ${teamName(game, ownPick.teamId)}` : ""}
          </span>
        </section>
      ) : null}

      <div className="flex flex-col items-center gap-1">
        <input
          id="tiebreaker-guess-step"
          aria-label="Tiebreaker Guess, combined final score"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          placeholder={overUnder === null ? undefined : String(overUnder)}
          value={typed}
          disabled={locked}
          onChange={(e) => {
            setTyped(e.target.value.replace(/\D/g, ""));
            setInvalid(null);
          }}
          className="h-[84px] w-40 border-0 border-b-[3px] border-secondary bg-transparent text-center font-display text-[60px] text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring disabled:opacity-70"
        />
        <label htmlFor="tiebreaker-guess-step" className="text-center text-[13px] leading-[18px] text-muted-foreground">
          Combined final score.{overUnder === null ? "" : ` The over/under is ${overUnder}.`} Closest guess wins ties.
        </label>
      </div>

      {shownError ? (
        <p role="alert" className="text-center text-sm font-semibold text-destructive">
          {shownError}
        </p>
      ) : null}

      <div className="mt-auto flex flex-col">
        <Button type="submit" size="lg" className="h-12 text-base" disabled={locked || saving}>
          {saving ? "Saving…" : "Save and review"}
        </Button>
        <button type="button" onClick={onSkip} className={SKIP}>
          Skip for now
        </button>
      </div>
    </form>
  );
}
