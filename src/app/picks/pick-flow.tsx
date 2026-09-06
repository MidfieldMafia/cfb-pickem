"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, CircleDashed, ListChecks, LoaderCircle, Lock, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LocalTime } from "@/components/local-time";
import { logoSrc } from "@/lib/logos";
import { useDeadlineClock } from "@/lib/picks/clock";
import type { ApiError } from "@/lib/picks/http";
import type { GameJson, SheetJson } from "@/lib/picks/json";

type Status = "saved" | "saving" | "failed";

interface LocalPick {
  teamId: number;
  status: Status;
  error?: string;
}

/** How long the Saved chip shows before the flow moves on. */
const ADVANCE_DELAY_MS = 400;

function firstUnpicked(games: GameJson[], picks: Record<number, LocalPick | undefined>): number {
  const index = games.findIndex((g) => !g.void && !picks[g.id]);
  return index === -1 ? 0 : index;
}

function ProgressStrip({
  games,
  picks,
  current,
  onJump,
}: {
  games: GameJson[];
  picks: Record<number, LocalPick | undefined>;
  current: number;
  onJump: (index: number) => void;
}) {
  return (
    <div className="flex gap-1 px-4" role="tablist" aria-label="Games">
      {games.map((g, i) => {
        const done = !!picks[g.id];
        const cur = i === current;
        return (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={cur}
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
    </div>
  );
}

function TeamTile({
  name,
  rank,
  picked,
  dimmed,
  disabled,
  onPick,
}: {
  name: string;
  rank: number | null;
  picked: boolean;
  dimmed: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const logo = logoSrc(name);
  return (
    <button
      type="button"
      aria-pressed={picked}
      disabled={disabled}
      onClick={onPick}
      className={`relative flex min-h-[124px] min-w-0 flex-1 flex-col items-center justify-end gap-2 rounded-xl border p-3 text-center transition-colors disabled:opacity-70 ${
        picked
          ? "border-primary bg-primary text-primary-foreground"
          : `border-border bg-card ${dimmed ? "text-muted-foreground opacity-60" : "text-foreground"}`
      }`}
    >
      {rank ? (
        <span
          className={`absolute left-2 top-2 rounded-full px-2 py-0.5 font-display text-sm font-black ${
            picked ? "bg-primary-foreground text-primary" : "bg-muted text-foreground"
          }`}
        >
          #{rank}
        </span>
      ) : null}
      {picked ? (
        <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-primary-foreground text-primary">
          <Check size={18} strokeWidth={3} />
        </span>
      ) : null}
      <span className="relative my-2 min-h-0 w-full flex-1">
        {logo ? (
          <Image src={logo} alt="" fill sizes="160px" unoptimized className="object-contain" />
        ) : null}
      </span>
      <span className="font-display text-[22px] font-black leading-[26px] text-balance">{name}</span>
    </button>
  );
}

function StatusChip({ pick }: { pick: LocalPick | undefined }) {
  const base = "inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold";
  if (!pick) {
    return (
      <span aria-live="polite" className={`${base} border-border text-foreground`}>
        <CircleDashed size={12} /> Pending
      </span>
    );
  }
  if (pick.status === "saving") {
    return (
      <span aria-live="polite" className={`${base} border-border text-muted-foreground`}>
        <LoaderCircle size={12} className="animate-spin" /> Saving
      </span>
    );
  }
  if (pick.status === "failed") {
    return (
      <span aria-live="polite" className={`${base} border-destructive text-destructive`}>
        <TriangleAlert size={12} /> Not saved
      </span>
    );
  }
  return (
    <span aria-live="polite" className={`${base} border-win bg-win text-win-foreground`}>
      <Check size={12} strokeWidth={3} /> Saved
    </span>
  );
}

/**
 * One game per screen. Tapping a team saves the pick and advances; the strip
 * on top shows where you are and jumps anywhere. Saving is optimistic: the
 * tile fills at once, the chip reports the server's answer, and a failure
 * leaves the tile marked with a retry.
 */
export function PickFlow({ sheet, startGameId }: { sheet: SheetJson; startGameId?: number }) {
  const router = useRouter();
  const games = sheet.games;
  const [picks, setPicks] = useState<Record<number, LocalPick | undefined>>(() =>
    Object.fromEntries(sheet.picks.map((p) => [p.gameId, { teamId: p.teamId, status: "saved" as const }])),
  );
  const [index, setIndex] = useState(() => {
    const requested = games.findIndex((g) => g.id === startGameId);
    return requested === -1 ? firstUnpicked(games, picks) : requested;
  });
  const [lockedByServer, setLockedByServer] = useState(sheet.locked);
  const [lateError, setLateError] = useState<string | null>(null);
  const { passed } = useDeadlineClock(sheet.deadline, sheet.serverNow);
  const locked = lockedByServer || passed;
  const [flash, setFlash] = useState(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attempt = useRef(0);

  useEffect(() => () => clearTimeout(advanceTimer.current), []);

  const game = games[index];
  const pick = picks[game.id];
  const pickedCount = games.filter((g) => picks[g.id]?.status !== undefined && picks[g.id]?.status !== "failed").length;
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
    const attemptId = ++attempt.current;
    const previous = picks[game.id];
    clearTimeout(advanceTimer.current);
    setFlash(false);
    setPicks((p) => ({ ...p, [game.id]: { teamId, status: "saving" } }));
    let result: LocalPick | undefined;
    try {
      const response = await fetch("/api/week/picks", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId: game.id, teamId }),
      });
      if (response.ok) {
        result = { teamId, status: "saved" };
      } else {
        const body = (await response.json().catch(() => ({}))) as Partial<ApiError>;
        if (body.locked) {
          // The Deadline passed under us: what the server holds is what counts, so show that.
          setLockedByServer(true);
          setLateError(body.error ?? "Picks are locked: the deadline has passed.");
          result = previous?.status === "saved" ? previous : undefined;
        } else {
          result = { teamId, status: "failed", error: body.error ?? "Couldn't save that pick." };
        }
      }
    } catch {
      result = { teamId, status: "failed", error: "No connection. Your pick is not saved yet." };
    }
    if (attemptId !== attempt.current) return;
    setPicks((p) => ({ ...p, [game.id]: result }));
    if (result?.status === "saved") {
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
          <div className="font-display text-lg font-black leading-6">
            {sheet.year} · Week {sheet.weekNumber}
          </div>
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

        <div className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <LocalTime at={game.kickoff} />
          {game.spread ? <span>· {game.spread}</span> : null}
          {game.id === sheet.tiebreakerGameId ? <Badge variant="secondary">Tiebreaker</Badge> : null}
          {game.void ? <Badge variant="outline">Void{game.voidNote ? `: ${game.voidNote}` : ""}</Badge> : null}
        </div>

        <div className="flex flex-1 items-stretch gap-1.5">
          <TeamTile
            name={game.awayTeam}
            rank={game.awayRank}
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
                  : "Tap a team. It saves the moment you tap; there is no submit step."}
          </span>
          {last ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/picks/review">
                Review picks <ChevronRight />
              </Link>
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => goTo(index + 1)}>
              {pick ? "Next" : "Skip for now"} <ChevronRight />
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
