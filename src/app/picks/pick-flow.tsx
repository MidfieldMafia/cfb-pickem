"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, CircleDashed, ListChecks, LoaderCircle, Lock, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MatchupPanel } from "@/components/picks/matchup-panel";
import { TeamTile } from "@/components/picks/team-tile";
import { WeatherPill } from "@/components/picks/weather-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LocalTime } from "@/components/local-time";
import { put } from "@/lib/picks/client";
import { useDeadlineClock } from "@/lib/picks/clock";
import type { GameJson, PickJson, SheetJson } from "@/lib/picks/json";

type Status = "saved" | "saving" | "failed";

interface LocalPick {
  teamId: number;
  status: Status;
  error?: string;
}

type LocalPicks = Record<number, LocalPick | undefined>;

/** How long the Saved chip shows before the flow moves on. */
const ADVANCE_DELAY_MS = 400;

const isSaved = (pick: LocalPick | undefined) => pick?.status === "saved";

/** The first live game without a saved pick; a failed save still counts as open. */
function firstUnpicked(games: GameJson[], picks: LocalPicks): number {
  const index = games.findIndex((g) => !g.void && !isSaved(picks[g.id]));
  return index === -1 ? 0 : index;
}

function ProgressStrip({
  games,
  picks,
  current,
  onJump,
}: {
  games: GameJson[];
  picks: LocalPicks;
  current: number;
  onJump: (index: number) => void;
}) {
  return (
    <nav aria-label="Games" className="flex gap-1 px-4">
      {games.map((g, i) => {
        const done = isSaved(picks[g.id]);
        const cur = i === current;
        return (
          <button
            key={g.id}
            type="button"
            aria-current={cur ? "step" : undefined}
            aria-label={`Game ${i + 1}${done ? ", picked" : ""}`}
            onClick={() => onJump(i)}
            className="min-h-tap flex-1 py-[18px]"
          >
            <span
              className={`block h-2 rounded-full ${done ? "bg-primary" : "bg-muted"} ${
                cur ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
              }`}
            />
          </button>
        );
      })}
    </nav>
  );
}

/** How each save state reads: its border, its icon, and its word. */
const CHIP = {
  pending: { look: "border-border text-foreground", Icon: CircleDashed, iconProps: {}, label: "Pending" },
  saving: {
    look: "border-border text-muted-foreground",
    Icon: LoaderCircle,
    iconProps: { className: "animate-spin" },
    label: "Saving",
  },
  failed: { look: "border-destructive text-destructive", Icon: TriangleAlert, iconProps: {}, label: "Not saved" },
  saved: { look: "border-win bg-win text-win-foreground", Icon: Check, iconProps: { strokeWidth: 3 }, label: "Saved" },
} as const;

/** One live region whose text changes, so screen readers announce the transition. */
function StatusChip({ pick }: { pick: LocalPick | undefined }) {
  const { look, Icon, iconProps, label } = CHIP[pick?.status ?? "pending"];
  return (
    <span
      aria-live="polite"
      className={`inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold ${look}`}
    >
      <Icon size={12} {...iconProps} />
      {label}
    </span>
  );
}

/**
 * One game per screen. Tapping a team saves the pick and advances; the strip
 * on top shows where you are and jumps anywhere. Saving is optimistic: the
 * tile fills at once, the chip reports the server's answer, and a failure
 * leaves the tile marked with a retry. Each game tracks its own in-flight
 * save, so jumping ahead mid-request never loses the earlier answer.
 */
export function PickFlow({ sheet, startGameId }: { sheet: SheetJson; startGameId?: number }) {
  const router = useRouter();
  const games = sheet.games;
  const liveGames = games.filter((g) => !g.void);
  const [picks, setPicks] = useState<LocalPicks>(() =>
    Object.fromEntries(sheet.picks.map((p) => [p.gameId, { teamId: p.teamId, status: "saved" as const }])),
  );
  const [index, setIndex] = useState(() => {
    const requested = games.findIndex((g) => g.id === startGameId);
    return requested === -1 ? firstUnpicked(games, picks) : requested;
  });
  const [lockedByServer, setLockedByServer] = useState(sheet.locked);
  const [lateError, setLateError] = useState<string | null>(null);
  const { passed, sync } = useDeadlineClock(sheet.deadline, sheet.serverNow);
  const locked = lockedByServer || passed;
  const [flash, setFlash] = useState(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attempts = useRef(new Map<number, number>());

  useEffect(() => () => clearTimeout(advanceTimer.current), []);

  const game = games[index];
  const detail = game.detail;
  const pick = picks[game.id];
  const pickedCount = liveGames.filter((g) => isSaved(picks[g.id])).length;
  const last = index + 1 >= games.length;

  const goTo = (i: number) => {
    clearTimeout(advanceTimer.current);
    setFlash(false);
    setIndex(i);
  };

  const advance = () => {
    if (last) router.push("/picks/review");
    else goTo(index + 1);
  };

  const choose = async (teamId: number) => {
    if (locked || game.void) return;
    const gameId = game.id;
    const attemptId = (attempts.current.get(gameId) ?? 0) + 1;
    attempts.current.set(gameId, attemptId);
    const previous = picks[gameId];
    clearTimeout(advanceTimer.current);
    setFlash(false);
    setPicks((p) => ({ ...p, [gameId]: { teamId, status: "saving" } }));

    const result = await put<{ pick: PickJson; serverNow: string }>("/api/week/picks", { gameId, teamId });
    // A newer tap on this same game supersedes this answer; other games are unaffected.
    if (attempts.current.get(gameId) !== attemptId) return;

    let next: LocalPick | undefined;
    if (result.ok) {
      sync(result.body.serverNow);
      next = { teamId, status: "saved" };
    } else if (result.locked) {
      // The Deadline passed under us: what the server holds is what counts, so show that.
      setLockedByServer(true);
      setLateError(result.error);
      next = isSaved(previous) ? previous : undefined;
    } else {
      next = { teamId, status: "failed", error: result.error };
    }
    setPicks((p) => ({ ...p, [gameId]: next }));
    if (next?.status === "saved" && games[index]?.id === gameId) {
      setFlash(true);
      advanceTimer.current = setTimeout(() => {
        setFlash(false);
        advance();
      }, ADVANCE_DELAY_MS);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="flex items-center gap-1 px-2 pb-1 pt-3">
        <Button asChild variant="ghost" size="icon" aria-label="Review picks">
          <Link href="/picks/review">
            <ListChecks />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg leading-6">Week {sheet.weekNumber}</div>
          <div className="text-sm text-muted-foreground">
            Game {index + 1} of {games.length} · {pickedCount} picked
          </div>
        </div>
        <StatusChip pick={pick} />
      </header>

      <ProgressStrip games={games} picks={picks} current={index} onJump={goTo} />

      <div className="flex flex-1 flex-col gap-2 px-4 pb-3 pt-2">
        {locked ? (
          <div role="status" className="flex items-center gap-2 rounded-md bg-locked p-3 text-sm text-locked-foreground">
            <Lock size={16} />
            <span>
              Picks are locked. The deadline was <LocalTime at={sheet.deadline} style="deadline" />.
            </span>
          </div>
        ) : null}

        <div className="flex min-h-6 items-center gap-2">
          <span className="grid min-w-0 flex-1 text-sm leading-[18px] text-muted-foreground">
            <span>
              <LocalTime at={game.kickoff} />
              {detail?.tv ? ` · ${detail.tv}` : ""}
            </span>
            {detail?.venue ? (
              <span className="truncate text-xs">
                {detail.venue}
                {detail.city ? ` · ${detail.city}` : ""}
              </span>
            ) : null}
          </span>
          {game.id === sheet.tiebreakerGameId ? <Badge variant="secondary">Tiebreaker</Badge> : null}
          {game.void ? <Badge variant="outline">Void{game.voidNote ? `: ${game.voidNote}` : ""}</Badge> : null}
          {detail?.weather ? <WeatherPill weather={detail.weather} /> : null}
        </div>

        <MatchupPanel
          awayTeam={game.awayTeam}
          homeTeam={game.homeTeam}
          spread={detail?.spread ?? game.spread}
          detail={detail}
        />

        <div className="flex flex-1 items-stretch gap-1.5">
          <TeamTile
            name={game.awayTeam}
            rank={game.awayRank}
            record={detail?.away.record ?? null}
            side="away"
            picked={pick?.teamId === game.awayTeamId}
            dimmed={!!pick && pick.teamId !== game.awayTeamId}
            disabled={locked || game.void}
            onPick={() => choose(game.awayTeamId)}
          />
          <div className="w-6 shrink-0 self-center text-center text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
            at
          </div>
          <TeamTile
            name={game.homeTeam}
            rank={game.homeRank}
            record={detail?.home.record ?? null}
            side="home"
            picked={pick?.teamId === game.homeTeamId}
            dimmed={!!pick && pick.teamId !== game.homeTeamId}
            disabled={locked || game.void}
            onPick={() => choose(game.homeTeamId)}
          />
        </div>

        {lateError ? (
          <p role="alert" className="rounded-md border border-destructive p-2 text-sm font-semibold text-destructive">
            {lateError}
          </p>
        ) : null}

        {pick?.status === "failed" ? (
          <div role="alert" className="flex items-center gap-2 rounded-md border border-destructive p-2 text-sm">
            <span className="flex-1 font-semibold text-destructive">{pick.error}</span>
            {locked ? null : (
              <Button type="button" variant="outline" size="sm" onClick={() => choose(pick.teamId)}>
                Retry
              </Button>
            )}
          </div>
        ) : null}

        <div className="flex min-h-tap items-center gap-2 pt-1">
          <span className="flex-1 text-sm text-muted-foreground">
            {flash
              ? last
                ? "Saved. On to review…"
                : "Saved. Next game…"
              : locked
                ? "Nothing more to enter this week."
                : game.void
                  ? "This game is void: it scores zero for everyone."
                  : "Tap a team. Saved the moment you tap; there is no submit step."}
          </span>
          {last ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/picks/review">
                Review picks <ChevronRight />
              </Link>
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => goTo(index + 1)}>
              {isSaved(pick) ? "Next" : "Skip for now"} <ChevronRight />
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
