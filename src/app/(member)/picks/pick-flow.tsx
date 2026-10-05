"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, CircleDashed, LoaderCircle, Lock, Scale, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { HEADER_TOP, HeaderLinks, Badge, Button, LocalTime, LINK } from "@saturday-slate/design-system";

import { MatchupPanel } from "@/components/picks/matchup-panel";
import { TeamTile } from "@/components/picks/team-tile";
import { WeatherPill } from "@/components/picks/weather-pill";

import { track } from "@/lib/analytics/analytics";
import { matchupColors } from "@/lib/matchup-colors";
import type { SheetGameJson, SheetJson } from "@/lib/picks/json";
import { firstOpenGame } from "@/lib/picks/progress";
import { usePickSheet, type ShownPick } from "@/lib/picks/use-pick-sheet";
import { pageAfter, walkAfterSave, type WalkPage } from "@/lib/picks/walk";
import { isVoid, voidNote } from "@/lib/slate/json";

import { GuessStep } from "./guess-step";
import { LockStep } from "./lock-step";

/** How long the Saved chip shows before the flow moves on. */
const ADVANCE_DELAY_MS = 400;

const isSaved = (pick: ShownPick | undefined) => pick?.state === "saved";

/** One game's Pick as the flow shows it: the server's, or a save it has not taken yet. */
type Picks = (gameId: number) => ShownPick | undefined;

/** Where the flow opens: the first game still to pick, or the top of the slate. */
function firstUnpicked(games: SheetGameJson[], picks: Picks): number {
  const open = firstOpenGame(games, (gameId) => isSaved(picks(gameId)));
  return open ? games.indexOf(open) : 0;
}

/** A row is the shared Game-and-result pair plus the pick screen's detail; the id sits on the Game. */
const idOf = (view: SheetGameJson) => view.game.id;

/** The strip's two markers after the games, in walk order. */
const MARKERS = [
  { page: "lock", label: "Lock of the Week", Icon: Lock },
  { page: "guess", label: "Tiebreaker Guess", Icon: Scale },
] as const;

/** What each walk page reads as under the week's title. */
const PAGE_TITLE: Record<WalkPage, string> = { lock: "Lock of the Week", guess: "Tiebreaker Guess" };

/**
 * One segment per game, then a lock and a scale marker: filled once set,
 * dashed while owed, ringed on the page you are on. Every segment and marker
 * jumps there.
 */
function ProgressStrip({
  games,
  picks,
  current,
  set,
  onJump,
  onOpen,
}: {
  games: SheetGameJson[];
  picks: Picks;
  /** The game or walk page on screen. */
  current: number | WalkPage;
  set: Record<WalkPage, boolean>;
  onJump: (index: number) => void;
  onOpen: (page: WalkPage) => void;
}) {
  return (
    <nav aria-label="Games" className="flex items-center gap-1 px-4">
      {games.map((g, i) => {
        const done = isSaved(picks(idOf(g)));
        const cur = i === current;
        return (
          <button
            key={idOf(g)}
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
      {MARKERS.map(({ page, label, Icon }) => {
        const done = set[page];
        const cur = page === current;
        return (
          <button
            key={page}
            type="button"
            aria-current={cur ? "step" : undefined}
            aria-label={`${label}${done ? ", set" : ""}`}
            onClick={() => onOpen(page)}
            className="grid min-h-tap min-w-tap shrink-0 place-items-center"
          >
            <span
              className={`grid size-[22px] place-items-center rounded-full ${
                done ? "bg-secondary text-secondary-foreground" : "border-2 border-dashed border-secondary text-secondary"
              } ${cur ? "ring-2 ring-secondary ring-offset-2 ring-offset-background" : ""}`}
            >
              <Icon size={12} strokeWidth={2.5} aria-hidden />
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function LockedNote({ deadline }: { deadline: string }) {
  return (
    <div role="status" className="flex items-center gap-2 rounded-md bg-locked p-3 text-sm text-locked-foreground">
      <Lock size={16} />
      <span>
        Picks are locked. The deadline was <LocalTime at={deadline} style="deadline" />.
      </span>
    </div>
  );
}

/**
 * How each save state reads: its Badge, its icon, and its word. `win` draws its
 * own check; the outline states tint `pending`'s border and text.
 */
const CHIP = {
  pending: { variant: "pending", look: "", Icon: CircleDashed, iconProps: {}, label: "Pending" },
  saving: {
    variant: "pending",
    look: "text-muted-foreground",
    Icon: LoaderCircle,
    iconProps: { className: "animate-spin" },
    label: "Saving",
  },
  failed: { variant: "pending", look: "border-destructive text-destructive", Icon: TriangleAlert, iconProps: {}, label: "Not saved" },
  saved: { variant: "win", look: "", Icon: null, iconProps: {}, label: "Saved" },
} as const;

/** One live region whose text changes, so screen readers announce the transition. */
function StatusChip({ pick }: { pick: ShownPick | undefined }) {
  const { variant, look, Icon, iconProps, label } = CHIP[pick?.state ?? "pending"];
  return (
    <Badge aria-live="polite" variant={variant} className={`min-h-7 px-2.5 font-semibold ${look}`}>
      {Icon ? <Icon aria-hidden {...iconProps} /> : null}
      {label}
    </Badge>
  );
}

/**
 * One game per screen. Tapping a team saves the pick and advances; the strip
 * on top shows where you are and jumps anywhere. Saving is optimistic: the
 * tile fills at once, the chip reports the server's answer, and a failure
 * leaves the tile marked with a retry. Each game tracks its own in-flight
 * save, so jumping ahead mid-request never loses the earlier answer.
 *
 * The save that fills the sheet walks on through the Lock of the Week and
 * Tiebreaker Guess pages, covering only what is missing (`walkAfterSave`).
 * Review opens either page on its own with `startPage`, and both go back there.
 */
export function PickFlow({
  sheet: initial,
  startGameId,
  startPage,
}: {
  sheet: SheetJson;
  startGameId?: number;
  startPage?: WalkPage;
}) {
  const router = useRouter();
  // Only a saved Pick counts as picked: an in-flight or failed save leaves its
  // game open here just as it does on the sheet.
  const { sheet: held, progress, locked, lateError, pick: picks, status, savePick, setLock, setGuess } =
    usePickSheet(initial);
  const games = held.games;
  const [index, setIndex] = useState(() => {
    const requested = games.findIndex((g) => idOf(g) === startGameId);
    return requested === -1 ? firstUnpicked(games, picks) : requested;
  });
  // The walk page on screen, if any, and the pages this walk covers in order.
  const [page, setPage] = useState<WalkPage | null>(startPage ?? null);
  const [walk, setWalk] = useState<WalkPage[]>(startPage ? [startPage] : []);
  // The line under the screen while it shows a save before moving on.
  const [flash, setFlash] = useState<string | null>(null);
  // The game just locked, while the Lock page shows it before moving on.
  const [lockChosen, setLockChosen] = useState<number | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(advanceTimer.current), []);

  const view = games[index];
  const { game, detail } = view;
  const voided = isVoid(view);
  const why = voidNote(view);
  const pick = picks(game.id);
  const tiebreaker = game.id === held.tiebreakerGameId;
  const last = index + 1 >= games.length;
  // What the end of the slate still owes, counting this game as picked: `advance`
  // runs from the post-save timeout, whose closure caught `picks` before the save
  // landed, so without that the game just saved reads as open and sends the flow
  // back to itself.
  const openAfterThis = firstOpenGame(games, (gameId) => gameId === game.id || isSaved(picks(gameId)));

  const settle = () => {
    clearTimeout(advanceTimer.current);
    setFlash(null);
    setLockChosen(null);
  };

  const goTo = (i: number) => {
    settle();
    setPage(null);
    setIndex(i);
  };

  const openPage = (next: WalkPage, pages: WalkPage[]) => {
    settle();
    setWalk(pages);
    setPage(next);
  };

  /** Leaves a walk page for the next one, or for Review. */
  const leave = (from: WalkPage) => {
    const next = pageAfter(walk, from);
    if (next === "review") return router.push("/picks/review");
    openPage(next, walk);
  };

  /** Shows `line` for the usual delay, then does `then`. */
  const flashThen = (line: string, then: () => void) => {
    setFlash(line);
    advanceTimer.current = setTimeout(() => {
      setFlash(null);
      then();
    }, ADVANCE_DELAY_MS);
  };

  // Mid-slate the flow walks in order, so a game skipped on purpose stays skipped
  // rather than yanking the member back. Only the end of the slate looks for what
  // is left: review is for a finished sheet, not for one with holes in it.
  const advance = () => {
    if (!last) return goTo(index + 1);
    if (openAfterThis) return goTo(games.indexOf(openAfterThis));
    router.push("/picks/review");
  };

  const choose = async (teamId: number) => {
    if (locked || voided) return;
    const gameId = game.id;
    // Read before the save lands: the walk starts only if this game was the last one open.
    const pages = walkAfterSave(progress, !isSaved(pick));
    settle();
    const outcome = await savePick(gameId, teamId);
    if (outcome.state !== "saved") return;
    track("pick_saved");
    if (games[index]?.game.id === gameId) {
      if (pages.length) {
        flashThen(`Saved. Now your ${pages[0] === "lock" ? "Lock" : "Tiebreaker Guess"}…`, () =>
          openPage(pages[0], pages),
        );
      } else {
        flashThen(last && !openAfterThis ? "Saved. On to review…" : "Saved. Next game…", advance);
      }
    }
  };

  const chooseLock = async (gameId: number) => {
    if (locked) return;
    settle();
    setLockChosen(gameId);
    const outcome = await setLock(gameId);
    if (outcome.state !== "saved") return setLockChosen(null);
    track("lock_set", { cleared: false });
    flashThen(
      pageAfter(walk, "lock") === "guess" ? "Locked. Next, your guess…" : "Locked. On to review…",
      () => leave("lock"),
    );
  };

  const saveGuess = async (guess: number) => {
    if ((await setGuess(guess)).state !== "saved") return;
    track("tiebreaker_saved");
    leave("guess");
  };

  const [awayColor, homeColor] = matchupColors(game.awayTeam, game.homeTeam);

  return (
    // `flex-1` rather than `min-h-dvh`: the bottom nav has the last rows of the viewport now.
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col">
      {/*
        The mark, the title over its progress line, then the help icon and the
        save chip, all centered on the row's midline. The progress line
        truncates rather than wrapping, so it stays one line at any slate size
        and the tiles below don't jump from game to game.
      */}
      <header className={`flex items-center gap-3 px-4 pb-1 ${HEADER_TOP}`}>
        <Image src="/brand/mark.svg" alt="" width={44} height={44} priority unoptimized />
        <div className="min-w-0 flex-1">
          <h1 className="m-0 font-display text-[22px] leading-7">Week {held.weekNumber}</h1>
          <div className="truncate text-sm leading-5 text-muted-foreground">
            {page
              ? `${PAGE_TITLE[page]}${walk.length > 1 ? ` · ${walk.indexOf(page) + 1} of ${walk.length}` : ""}`
              : `Game ${index + 1} of ${games.length}`}
          </div>
        </div>
        <HeaderLinks />
        {page ? null : <StatusChip pick={pick} />}
      </header>

      <ProgressStrip
        games={games}
        picks={picks}
        current={page ?? index}
        set={{ lock: progress.lockSet, guess: progress.guessSet }}
        onJump={goTo}
        // Within a walk a marker moves between its pages and keeps the rest owed;
        // anywhere else it opens that page on its own, which goes back to Review.
        onOpen={(p) => openPage(p, page && walk.includes(p) ? walk : [p])}
      />

      {page && locked ? (
        <div className="px-4 pt-2">
          <LockedNote deadline={held.deadline} />
        </div>
      ) : null}

      {page === "lock" ? (
        <LockStep
          sheet={held}
          pick={picks}
          locked={locked}
          saving={status.lock.state === "saving"}
          chosen={lockChosen}
          error={status.lock.state === "failed" ? status.lock.error : null}
          hint={flash ?? "Tap a pick to lock it."}
          onLock={chooseLock}
          onOpenGame={(gameId) => goTo(games.findIndex((g) => idOf(g) === gameId))}
          onSkip={() => leave("lock")}
        />
      ) : page === "guess" ? (
        <GuessStep
          sheet={held}
          pick={picks}
          locked={locked}
          saving={status.guess.state === "saving"}
          error={status.guess.state === "failed" ? status.guess.error : null}
          onSave={saveGuess}
          onSkip={() => leave("guess")}
        />
      ) : (
        <div className="flex flex-1 flex-col gap-2 px-4 pb-3 pt-2">
          {locked ? <LockedNote deadline={held.deadline} /> : null}

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
            {tiebreaker ? (
              <Badge variant="secondary">
                <Scale size={12} aria-hidden />
                Tiebreaker
              </Badge>
            ) : null}
            {voided ? <Badge variant="void">Void{why ? `: ${why}` : ""}</Badge> : null}
            {detail?.weather ? <WeatherPill weather={detail.weather} /> : null}
          </div>

          {/* An outline, not a border: it sets the Tiebreaker Game apart without moving the tiles. */}
          <div
            className={`flex flex-1 flex-col gap-2 rounded-lg ${tiebreaker ? "outline-2 outline-offset-4 outline-secondary" : ""}`}
          >
          <MatchupPanel
            awayTeam={game.awayTeam}
            homeTeam={game.homeTeam}
            spread={detail?.spread ?? game.spread}
            detail={detail}
          />

          <div className="flex flex-1 items-stretch gap-1.5">
            <TeamTile
              name={game.awayTeam}
              color={awayColor}
              rank={game.awayRank}
              record={detail?.away.record ?? null}
              side="away"
              picked={pick?.teamId === game.awayTeamId}
              dimmed={!!pick && pick.teamId !== game.awayTeamId}
              disabled={locked || voided}
              onPick={() => choose(game.awayTeamId)}
            />
            <div className="w-6 shrink-0 self-center text-center text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
              at
            </div>
            <TeamTile
              name={game.homeTeam}
              color={homeColor}
              rank={game.homeRank}
              record={detail?.home.record ?? null}
              side="home"
              picked={pick?.teamId === game.homeTeamId}
              dimmed={!!pick && pick.teamId !== game.homeTeamId}
              disabled={locked || voided}
              onPick={() => choose(game.homeTeamId)}
            />
          </div>
          </div>

          {lateError ? (
            <p role="alert" className="rounded-md border border-destructive p-2 text-sm font-semibold text-destructive">
              {lateError}
            </p>
          ) : null}

          {pick?.state === "failed" ? (
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
                ? flash
                : locked
                  ? "Nothing more to enter this week."
                  : voided
                    ? "This game is void: it scores zero for everyone."
                    : // Shorter than it was: with Review beside it, the old wording ran to a
                      // third line at 375px whichever way the forward button read.
                      "Tap a team — it saves as you go, no submit step."}
            </span>
            {/*
              Review is reachable from every game, not only the last one: it is
              where the Lock of the Week and the Tiebreaker Guess sit beside every
              pick, and the flow walks the slate in order, so a member part-way
              down it had no way to that screen but to pick out the rest first.

              Mid-slate it is the underlined text link the Leaderboard and You
              screens use for a secondary destination, not a second button —
              `Next` stays the one obvious move, and an aside that reads as a link
              beats a ghost button that reads as label text. `tap` because
              `tokens/base.css` holds `button` to the 44px floor but leaves
              anchors to opt in; the last game's Button-as-Link needs it for the
              same reason, and had measured 32px since it was written.
            */}
            {last ? (
              <Button asChild variant="outline" size="sm" className="tap">
                <Link href="/picks/review">
                  {isSaved(pick) ? "Review picks" : "Skip for now"} <ChevronRight />
                </Link>
              </Button>
            ) : (
              <>
                <Link
                  href="/picks/review"
                  className={LINK}
                >
                  Review
                </Link>
                <Button type="button" variant="outline" size="sm" onClick={() => goTo(index + 1)}>
                  {isSaved(pick) ? "Next" : "Skip for now"} <ChevronRight />
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
