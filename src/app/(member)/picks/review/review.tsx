"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Clock, Lock } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { HEADER_TOP, HeaderLinks, Badge, Button, Card, Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, Input, Progress, LocalTime, SECTION_LABEL as LABEL } from "@saturday-slate/design-system";

import { groupByKickoff, windowLabel } from "@/components/picks/kickoff-groups";
import { TeamLogo } from "@/components/team-logo";

import { put } from "@/lib/picks/client";
import { formatCountdown } from "@/lib/picks/clock";
import type { SheetGameJson, SheetJson } from "@/lib/picks/json";
import { tiebreakerGuessError } from "@/lib/picks/limits";
import { firstOpenGame, liveGames, remainingLabel } from "@/lib/picks/progress";
import { usePickSheet } from "@/lib/picks/use-pick-sheet";
import { plural } from "@/lib/plural";
import { isVoid, teamName, voidNote } from "@/lib/slate/json";

function StepRow({
  done,
  label,
  detail,
  action,
  disabled,
  onClick,
}: {
  done: boolean;
  label: string;
  detail: string;
  action: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-tap w-full items-center gap-2.5 px-0.5 text-left disabled:opacity-70"
    >
      <span
        className={`grid size-[22px] shrink-0 place-items-center rounded-full ${
          done ? "bg-win text-win-foreground" : "border-2 border-dashed border-secondary"
        }`}
      >
        {done ? <Check size={14} strokeWidth={3} /> : null}
      </span>
      <span className="grid min-w-0 flex-1">
        <span className="text-sm font-semibold">{label}</span>
        <span className="truncate text-xs text-muted-foreground">{detail}</span>
      </span>
      {disabled ? null : (
        <span className={`text-sm font-semibold ${done ? "text-muted-foreground" : "text-secondary"}`}>{action}</span>
      )}
    </button>
  );
}

/**
 * Every pick on one screen. Tap a row to change it in the pick flow; choose
 * the Lock of the Week from a drawer of your own picks; type the Tiebreaker
 * Guess. The countdown runs on the server clock, and at zero the screen
 * flips to its locked state without a reload.
 */
export function Review({ initial }: { initial: SheetJson }) {
  const router = useRouter();
  const { sheet, progress, locked, remainingMs, patch, apply, receive } = usePickSheet(initial);

  const [lockOpen, setLockOpen] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const [lockPending, setLockPending] = useState(false);

  const [guess, setGuess] = useState(initial.tiebreakerGuess === null ? "" : String(initial.tiebreakerGuess));
  const [guessState, setGuessState] = useState<{ error?: string; saved?: boolean; pending?: boolean }>({});

  // What the member has changed on this screen; a later refetch must not write over it.
  const touched = useRef({ lock: false, guess: false });

  // Re-read the sheet from the API on arrival so the countdown starts from a fresh server clock.
  useEffect(() => {
    let stale = false;
    fetch("/api/week/picks", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<SheetJson>) : null))
      .then((fresh) => {
        if (!fresh || stale) return;
        receive(fresh, (current) => ({
          ...(touched.current.lock && { lockGameId: current.lockGameId, lockDropped: current.lockDropped }),
          ...(touched.current.guess && { tiebreakerGuess: current.tiebreakerGuess }),
        }));
        setGuess((current) =>
          current === "" && !touched.current.guess && fresh.tiebreakerGuess !== null ? String(fresh.tiebreakerGuess) : current,
        );
      })
      .catch(() => {
        // The server-rendered sheet stands until the network is back.
      });
    return () => {
      stale = true;
    };
    // Runs once on arrival; `receive` is stable enough for that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickFor = (gameId: number) => sheet.picks.find((p) => p.gameId === gameId);
  const picked = (gameId: number) => pickFor(gameId) !== undefined;
  const open = progress.liveGames - progress.picksMade;
  const lockGame = sheet.games.find((g) => g.game.id === sheet.lockGameId)?.game;
  const lockPick = lockGame ? pickFor(lockGame.id) : undefined;
  const tiebreakerGame = sheet.games.find((g) => g.game.id === sheet.tiebreakerGameId)?.game;
  const steps = progress.liveGames + 2;
  const stepsDone = progress.picksMade + (progress.lockSet ? 1 : 0) + (progress.guessSet ? 1 : 0);
  const firstOpen = firstOpenGame(sheet.games, picked);
  const groups = groupByKickoff(sheet.games);
  const tiebreakerLine = tiebreakerGame
    ? `Combined final score, ${tiebreakerGame.awayTeam} at ${tiebreakerGame.homeTeam}`
    : "Combined final score of the Tiebreaker Game";

  const chooseLock = async (gameId: number | null) => {
    setLockPending(true);
    setLockError(null);
    touched.current.lock = true;
    // Optimistic in `lockGameId` alone — the field the member just chose. Whether
    // that leaves a Dropped Lock is the server's to answer, and it answers with
    // the whole sheet; this screen used to assert `lockDropped: false` here while
    // that answer went unread.
    patch((s) => ({ ...s, lockGameId: gameId }));
    const result = await put<SheetJson>("/api/week/lock", { gameId });
    setLockPending(false);
    apply(result);
    if (result.ok) {
      setLockOpen(false);
      return;
    }
    setLockError(result.error);
  };

  const saveGuess = async (event: FormEvent) => {
    event.preventDefault();
    const value = Number(guess);
    const invalid = guess.trim() === "" ? "Enter a guess first." : tiebreakerGuessError(value);
    if (invalid) {
      setGuessState({ error: invalid });
      return;
    }
    setGuessState({ pending: true });
    touched.current.guess = true;
    const result = await put<SheetJson>("/api/week/tiebreaker", { guess: value });
    // On success the stored Guess as the server has it, rather than the value sent to it.
    apply(result);
    setGuessState(result.ok ? { saved: true } : { error: result.error });
  };

  const pickRow = (view: SheetGameJson) => {
    const { game } = view;
    const voided = isVoid(view);
    const why = voidNote(view);
    const pick = pickFor(game.id);
    const body = (
      <>
        {pick ? (
          <TeamLogo team={teamName(game, pick.teamId)} size={32} />
        ) : (
          <span aria-hidden className="size-8 shrink-0 rounded-full border border-dashed border-border" />
        )}
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-xs text-muted-foreground">
            {game.awayTeam} at {game.homeTeam}
            {game.id === sheet.tiebreakerGameId ? " · Tiebreaker" : ""}
            {voided ? ` · Void${why ? `: ${why}` : ""}` : ""}
          </span>
          {pick ? (
            <span className="font-display text-lg leading-[22px]">{teamName(game, pick.teamId)}</span>
          ) : (
            <span className="text-sm font-semibold text-secondary">
              {voided ? "Scores zero for everyone" : "No pick yet"}
            </span>
          )}
        </span>
        {sheet.lockGameId === game.id ? (
          <Badge variant="secondary">
            <Lock /> Lock
          </Badge>
        ) : null}
        {locked || voided ? null : <ChevronRight size={18} className="text-muted-foreground" />}
      </>
    );
    return (
      <li key={game.id} className={voided ? "opacity-70" : ""}>
        {locked || voided ? (
          <div className="flex min-h-14 items-center gap-2.5 px-3 py-1.5">{body}</div>
        ) : (
          <Link href={`/picks?game=${game.id}`} className="flex min-h-14 items-center gap-2.5 px-3 py-1.5 no-underline">
            {body}
          </Link>
        )}
      </li>
    );
  };

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-4 pb-8">
      {/*
        The header icons sit beside the badge on the title's row, so the
        deadline line below keeps the full width — beside a commissioner's two
        icons and the badge it wrapped at phone width.
      */}
      <header className={`space-y-1 ${HEADER_TOP}`}>
        <div className="flex items-center gap-3">
          <Image src="/brand/mark.svg" alt="" width={44} height={44} priority unoptimized />
          <div className="min-w-0 flex-1">
            <h1 className="m-0 font-display text-[22px] leading-7">Review picks</h1>
            <div className="truncate text-sm leading-5 text-muted-foreground">Week {sheet.weekNumber}</div>
          </div>
          <HeaderLinks />
          <Badge variant={progress.remaining ? "outline" : "default"}>
            {stepsDone} of {steps}
          </Badge>
        </div>
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          <Clock size={14} />
          {locked ? (
            <span>
              Locked <LocalTime at={sheet.deadline} style="deadline" />
            </span>
          ) : (
            <span>
              Deadline in{" "}
              <span className="font-semibold tabular-nums text-foreground">{formatCountdown(remainingMs)}</span>
            </span>
          )}
        </p>
      </header>

      <Progress
        value={progress.liveGames ? (progress.picksMade / progress.liveGames) * 100 : 0}
        aria-label="Picks made"
      />

      {locked ? (
        <div role="status" className="flex items-center gap-2 rounded-md bg-locked p-3 text-sm text-locked-foreground">
          <Lock size={16} />
          <span>Picks are locked. What is here is what counts this week.</span>
        </div>
      ) : null}

      <section
        className={`grid gap-1.5 rounded-xl border p-2.5 ${
          progress.remaining && !locked ? "border-secondary bg-accent" : "border-border bg-card"
        }`}
      >
        <div className="flex min-h-5 items-center gap-2">
          <span className={`flex-1 ${LABEL} ${progress.remaining && !locked ? "" : "text-muted-foreground"}`}>
            {remainingLabel(progress, sheet.weekNumber, locked)}
          </span>
          {!progress.remaining && !locked ? <Check size={16} strokeWidth={3} className="text-win-foreground" /> : null}
        </div>
        <StepRow
          done={open === 0}
          label="Make every pick"
          detail={open ? `${plural(open, "game")} still open` : `All ${progress.liveGames} picked`}
          action={open ? "Set" : "Change"}
          disabled={locked}
          onClick={() => router.push(firstOpen ? `/picks?game=${firstOpen.game.id}` : "/picks")}
        />
        <StepRow
          done={progress.lockSet}
          label="Lock of the Week"
          detail={
            lockGame && lockPick
              ? sheet.lockDropped
                ? `${teamName(lockGame, lockPick.teamId)} is void; ${locked ? "no Lock counts this week" : "choose another"}`
                : `${teamName(lockGame, lockPick.teamId)} counts ${sheet.lockMultiplier}×`
              : `One pick counts ${sheet.lockMultiplier}×`
          }
          action={progress.lockSet ? "Change" : "Set"}
          disabled={locked}
          onClick={() => setLockOpen(true)}
        />
        <StepRow
          done={progress.guessSet}
          label="Tiebreaker Guess"
          detail={progress.guessSet ? `${sheet.tiebreakerGuess} points combined` : tiebreakerLine}
          action={progress.guessSet ? "Change" : "Set"}
          disabled={locked}
          onClick={() => document.getElementById("tiebreaker-guess")?.focus()}
        />
      </section>

      {groups.map((group) => (
        <section key={group.kickoff}>
          <div className="flex items-baseline gap-2 pb-1 pt-2">
            <h2 className={LABEL}>{windowLabel(group.kickoff)}</h2>
            <span className="text-xs text-muted-foreground">
              <LocalTime at={group.kickoff} />
            </span>
          </div>
          <Card asChild className="gap-0 overflow-hidden p-0">
            <ul className="divide-y divide-border">{group.games.map(pickRow)}</ul>
          </Card>
        </section>
      ))}

      <section>
        <h2 className={`pb-1 pt-2 ${LABEL}`}>Lock of the Week</h2>
        {/* A control, but the same surface: `asChild` keeps the button element
            and its semantics while the radius and border come from Card, so
            this stops being a hand-copy of the card recipe that can drift. */}
        <Card asChild className="min-h-14 w-full flex-row items-center px-3 py-2 text-left">
          <button
            type="button"
            disabled={locked}
            onClick={() => setLockOpen(true)}
            className="disabled:opacity-70"
          >
            <span
              className={`grid size-9 place-items-center rounded-full ${
                progress.lockSet ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              <Lock size={18} />
            </span>
            <span className="grid flex-1 gap-0.5">
              {lockGame && lockPick ? (
                <>
                  <span className="font-display text-lg leading-[22px]">{teamName(lockGame, lockPick.teamId)}</span>
                  <span className="text-xs text-muted-foreground">
                    {sheet.lockDropped
                      ? locked
                        ? "That game is void, so no Lock counts this week"
                        : "That game is void and scores zero; choose another Lock"
                      : `${sheet.lockMultiplier}× points if they win`}{" "}
                    ·{" "}
                    {lockGame.awayTeam} at {lockGame.homeTeam}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-semibold">{locked ? "No Lock this week" : "Choose your Lock"}</span>
                  <span className="text-xs text-muted-foreground">One pick counts {sheet.lockMultiplier}× this week.</span>
                </>
              )}
            </span>
            {locked ? null : (
              <span className="text-sm font-semibold text-secondary">{progress.lockSet ? "Change" : "Choose"}</span>
            )}
          </button>
        </Card>
        {lockError ? (
          <p role="alert" className="pt-1 text-sm font-semibold text-destructive">
            {lockError}
          </p>
        ) : null}
        <Link href="/rules" className="mt-1 inline-block text-sm font-semibold underline underline-offset-4">
          See how to play
        </Link>
      </section>

      <section>
        <h2 className={`pb-1 pt-2 ${LABEL}`}>Tiebreaker Guess</h2>
        <form onSubmit={saveGuess} className="grid gap-2">
          <p className="text-sm text-muted-foreground">{tiebreakerLine}. Closest guess wins ties.</p>
          <div className="flex gap-2">
            <Input
              id="tiebreaker-guess"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="e.g. 52"
              value={guess}
              disabled={locked}
              aria-label="Tiebreaker Guess"
              onChange={(e) => {
                setGuess(e.target.value.replace(/\D/g, ""));
                setGuessState({});
              }}
              className={progress.guessSet ? "" : "border-secondary"}
            />
            <Button type="submit" variant="outline" disabled={locked || guessState.pending}>
              {guessState.pending ? "Saving…" : "Save"}
            </Button>
          </div>
          {guessState.error ? (
            <p role="alert" className="text-sm font-semibold text-destructive">
              {guessState.error}
            </p>
          ) : null}
          {guessState.saved ? (
            <p role="status" className="text-sm text-muted-foreground">
              Saved.
            </p>
          ) : null}
        </form>
      </section>

      <Link href="/" className="pt-2 text-sm font-semibold underline underline-offset-4">
        Back to this week
      </Link>

      <Drawer open={lockOpen} onOpenChange={setLockOpen}>
        <DrawerContent className="mx-auto max-w-md">
          <DrawerHeader>
            <DrawerTitle>Lock of the Week</DrawerTitle>
            <DrawerDescription>
              One of your picks. It scores {sheet.lockMultiplier}× if it wins; nothing extra if it loses.
            </DrawerDescription>
          </DrawerHeader>
          <div className="grid max-h-80 gap-1.5 overflow-y-auto px-4">
            {progress.picksMade === 0 ? (
              <p className="py-3 text-center text-sm text-muted-foreground">Make a pick first, then lock it.</p>
            ) : null}
            {liveGames(sheet.games).map(({ game }) => {
              const pick = pickFor(game.id);
              if (!pick) return null;
              const on = sheet.lockGameId === game.id;
              return (
                <button
                  key={game.id}
                  type="button"
                  aria-pressed={on}
                  disabled={lockPending}
                  onClick={() => chooseLock(game.id)}
                  className={`flex min-h-[52px] items-center gap-3 rounded-md border px-3 text-left ${
                    on ? "border-secondary bg-secondary text-secondary-foreground" : "border-border bg-card"
                  }`}
                >
                  <TeamLogo team={teamName(game, pick.teamId)} size={28} />
                  <span className="flex-1 font-display text-lg">{teamName(game, pick.teamId)}</span>
                  <span className="text-xs opacity-80">
                    {game.awayTeam} at {game.homeTeam}
                  </span>
                  {on ? <Lock size={16} /> : null}
                </button>
              );
            })}
          </div>
          <DrawerFooter>
            <Button type="button" variant="ghost" disabled={lockPending} onClick={() => chooseLock(null)}>
              No Lock this week
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </main>
  );
}
