"use client";

import { Lock } from "lucide-react";

import { TeamLogo } from "@/components/team-logo";

import { shortSchool } from "@/lib/logos";
import type { SheetJson } from "@/lib/picks/json";
import { countingGames, lockGameOf } from "@/lib/picks/progress";
import type { ShownPick } from "@/lib/picks/use-pick-sheet";
import { teamName } from "@/lib/slate/json";

/** The underlined text button both walk pages use to move on without saving. */
export const SKIP = "min-h-tap px-3 text-sm font-semibold underline underline-offset-4";

/**
 * "Pick your Lock": a 2-column grid of the member's picks, one tile per counting
 * game. Tapping a tile saves the Lock and the flow moves on; "Skip for now"
 * moves on without saving anything. There is no "No Lock this week": a Lock
 * only adds points, so once set it is moved, never taken off.
 *
 * The walk only runs on a full sheet, but Review opens this page whenever, so
 * an open game shows as a dashed "No pick yet" tile that opens that game.
 */
export function LockStep({
  sheet,
  pick,
  locked,
  saving,
  chosen,
  error,
  hint,
  onLock,
  onOpenGame,
  onSkip,
}: {
  sheet: SheetJson;
  pick: (gameId: number) => ShownPick | undefined;
  locked: boolean;
  /** A Lock save is in flight: the tiles wait for it. */
  saving: boolean;
  /** The game just locked, while the flow shows it before moving on; the rest fade. */
  chosen: number | null;
  error: string | null;
  hint: string;
  onLock: (gameId: number) => void;
  onOpenGame: (gameId: number) => void;
  onSkip: () => void;
}) {
  const lockGameId = lockGameOf(sheet.lock);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 px-4 pb-3 pt-1">
      <div className="grid gap-0.5">
        <h2 className="m-0 font-display text-2xl leading-[30px]">Pick your Lock</h2>
        <p className="text-sm text-muted-foreground">
          One of your picks scores {sheet.lockMultiplier}× if it wins. Nothing extra if it loses.
        </p>
      </div>

      <ul className="grid min-h-0 flex-1 auto-rows-[minmax(var(--spacing-tap),1fr)] grid-cols-2 gap-1.5 overflow-y-auto">
        {countingGames(sheet.games).map(({ game }) => {
          const matchup = `${shortSchool(game.awayTeam)} at ${shortSchool(game.homeTeam)}`;
          const shown = pick(game.id);
          if (shown?.state !== "saved") {
            return (
              <li key={game.id} className="grid">
                <button
                  type="button"
                  disabled={locked || saving}
                  onClick={() => onOpenGame(game.id)}
                  className="flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-secondary p-1 text-secondary disabled:opacity-70"
                >
                  <span aria-hidden className="size-9 rounded-full border-2 border-dashed border-secondary" />
                  <span className="max-w-full truncate font-display text-base leading-5">No pick yet</span>
                  <span className="max-w-full truncate text-[11px] leading-[14px] opacity-80">{matchup}</span>
                </button>
              </li>
            );
          }
          const team = teamName(game, shown.teamId);
          const on = (chosen ?? lockGameId) === game.id;
          const faded = chosen !== null && !on;
          return (
            <li key={game.id} className="grid">
              <button
                type="button"
                aria-pressed={on}
                disabled={locked || saving}
                onClick={() => onLock(game.id)}
                className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg p-1 transition-opacity disabled:cursor-default ${
                  // An inset ring rather than a thicker border, so choosing a tile never resizes its row.
                  on
                    ? "border border-secondary bg-secondary text-secondary-foreground ring-2 ring-inset ring-secondary"
                    : "border border-border bg-card"
                } ${faded ? "opacity-45" : ""}`}
              >
                <TeamLogo team={team} size={36} />
                <span className="flex max-w-full items-center gap-1 font-display text-base leading-5">
                  <span className="truncate">{shortSchool(team)}</span>
                  {on ? <Lock size={14} aria-hidden className="shrink-0" /> : null}
                </span>
                <span className="max-w-full truncate text-[11px] leading-[14px] opacity-80">{matchup}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {error ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex min-h-tap items-center gap-2">
        <span aria-live="polite" className="flex-1 text-sm text-muted-foreground">
          {hint}
        </span>
        <button type="button" onClick={onSkip} className={SKIP}>
          Skip for now
        </button>
      </div>
    </div>
  );
}
