"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Clock, Lock, Scale } from "lucide-react";
import type { ReactNode } from "react";
import { HEADER_TOP, HeaderLinks, Badge, Card, Progress, LocalTime, SECTION_LABEL as LABEL, LINK } from "@saturday-slate/design-system";

import { groupByKickoff, windowLabel } from "@/components/picks/kickoff-groups";
import { TeamLogo } from "@/components/team-logo";

import { formatCountdown } from "@/lib/picks/clock";
import { tiebreakerView, type SheetGameJson, type SheetJson } from "@/lib/picks/json";
import { firstOpenGame, lockGameOf, remainingLabel } from "@/lib/picks/progress";
import { usePickSheet } from "@/lib/picks/use-pick-sheet";
import { plural } from "@/lib/plural";
import { isVoid, teamName, voidNote } from "@/lib/slate/json";

/** The pick flow's Lock and Guess pages, opened on their own; both come back here. */
const LOCK_PAGE = "/picks?step=lock";
const GUESS_PAGE = "/picks?step=guess";

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
 * One of the two summary cards at the foot of Review: what is set, and a tap
 * that opens the pick flow's page for it. A control, but the same surface:
 * `asChild` keeps the button element and its semantics while the radius and
 * border come from Card, so this stops being a hand-copy of the card recipe.
 */
function SummaryCard({
  set,
  locked,
  icon,
  title,
  detail,
  onClick,
}: {
  set: boolean;
  locked: boolean;
  icon: ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <Card asChild className="min-h-14 w-full flex-row items-center px-3 py-2 text-left">
      <button type="button" disabled={locked} onClick={onClick} className="disabled:opacity-70">
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-full ${
            set ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          {icon}
        </span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className={set ? "font-display text-lg leading-[22px]" : "font-semibold"}>{title}</span>
          <span className="text-xs text-muted-foreground">{detail}</span>
        </span>
        {locked ? null : <span className="text-sm font-semibold text-secondary">{set ? "Change" : "Choose"}</span>}
      </button>
    </Card>
  );
}

/**
 * Every pick on one screen. Tap a row to change it in the pick flow. The Lock
 * of the Week and the Tiebreaker Guess are set on the pick flow's own pages,
 * which come back here: both their StepRows and their summary cards at the
 * foot open them, so each has one way to change it. There is no way to take a
 * Lock back off — it adds points when it wins and costs nothing when it loses
 * — though a Dropped Lock can still be moved. The countdown runs on the server
 * clock, and at zero the screen flips to its locked state without a reload.
 */
export function Review({ initial }: { initial: SheetJson }) {
  const router = useRouter();
  // Re-read on arrival so the countdown starts from a fresh server clock.
  const { sheet, progress, locked, remainingMs } = usePickSheet(initial, { refetch: true });

  const pickFor = (gameId: number) => sheet.picks.find((p) => p.gameId === gameId);
  const picked = (gameId: number) => pickFor(gameId) !== undefined;
  const open = progress.countingGames - progress.picksMade;
  const lockGameId = lockGameOf(sheet.lock);
  const lockDropped = sheet.lock.state === "dropped";
  const lockGame = sheet.games.find((g) => g.game.id === lockGameId)?.game;
  const lockPick = lockGame ? pickFor(lockGame.id) : undefined;
  const tiebreakerGame = tiebreakerView(sheet)?.game;
  // A Lock needs a counting game to sit on, so a wholly Void slate has no Lock step to finish.
  const steps = progress.countingGames + (progress.countingGames > 0 ? 1 : 0) + 1;
  const stepsDone = progress.picksMade + (progress.lockSet ? 1 : 0) + (progress.guessSet ? 1 : 0);
  const firstOpen = firstOpenGame(sheet.games, picked);
  const groups = groupByKickoff(sheet.games);
  const tiebreakerLine = tiebreakerGame
    ? `Combined final score, ${tiebreakerGame.awayTeam} at ${tiebreakerGame.homeTeam}`
    : "Combined final score of the Tiebreaker Game";

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
        {lockGameId === game.id ? (
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
        value={progress.countingGames ? (progress.picksMade / progress.countingGames) * 100 : 0}
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
          detail={open ? `${plural(open, "game")} still open` : `All ${progress.countingGames} picked`}
          action={open ? "Set" : "Change"}
          disabled={locked}
          onClick={() => router.push(firstOpen ? `/picks?game=${firstOpen.game.id}` : "/picks")}
        />
        <StepRow
          done={progress.lockSet}
          label="Lock of the Week"
          detail={
            lockGame && lockPick
              ? lockDropped
                ? `${teamName(lockGame, lockPick.teamId)} is void; ${locked ? "no Lock counts this week" : "choose another"}`
                : `${teamName(lockGame, lockPick.teamId)} counts ${sheet.lockMultiplier}×`
              : `One pick counts ${sheet.lockMultiplier}×`
          }
          action={progress.lockSet ? "Change" : "Set"}
          disabled={locked}
          onClick={() => router.push(LOCK_PAGE)}
        />
        <StepRow
          done={progress.guessSet}
          label="Tiebreaker Guess"
          detail={progress.guessSet ? `${sheet.tiebreakerGuess} points combined` : tiebreakerLine}
          action={progress.guessSet ? "Change" : "Set"}
          disabled={locked}
          onClick={() => router.push(GUESS_PAGE)}
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
        <SummaryCard
          set={!!(lockGame && lockPick)}
          locked={locked}
          icon={<Lock size={18} />}
          title={lockGame && lockPick ? teamName(lockGame, lockPick.teamId) : locked ? "No Lock this week" : "Choose your Lock"}
          detail={
            lockGame && lockPick
              ? `${
                  lockDropped
                    ? locked
                      ? "That game is void, so no Lock counts this week"
                      : "That game is void and scores zero; choose another Lock"
                    : `${sheet.lockMultiplier}× points if they win`
                } · ${lockGame.awayTeam} at ${lockGame.homeTeam}`
              : `One pick counts ${sheet.lockMultiplier}× this week.`
          }
          onClick={() => router.push(LOCK_PAGE)}
        />
        <Link href="/rules" className={LINK}>
          See how to play
        </Link>
      </section>

      <section>
        <h2 className={`pb-1 pt-2 ${LABEL}`}>Tiebreaker Guess</h2>
        <SummaryCard
          set={progress.guessSet}
          locked={locked}
          icon={<Scale size={18} />}
          title={progress.guessSet ? `${sheet.tiebreakerGuess} points combined` : locked ? "No guess this week" : "Enter your guess"}
          detail={`${tiebreakerLine}. Closest guess wins ties.`}
          onClick={() => router.push(GUESS_PAGE)}
        />
      </section>

      <Link href="/" className={LINK}>
        Back to this week
      </Link>

    </main>
  );
}
