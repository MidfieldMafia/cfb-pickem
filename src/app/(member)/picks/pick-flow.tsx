"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, CircleDashed, LoaderCircle, Lock, Scale, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { HEADER_TOP, HeaderLinks, Badge, Button, LocalTime } from "@saturday-slate/design-system";

import { MatchupPanel } from "@/components/picks/matchup-panel";
import { TeamTile } from "@/components/picks/team-tile";
import { WeatherPill } from "@/components/picks/weather-pill";

import { matchupColors } from "@/lib/matchup-colors";
import { put } from "@/lib/picks/client";
import type { SheetGameJson, SheetJson } from "@/lib/picks/json";
import { firstOpenGame } from "@/lib/picks/progress";
import { usePickSheet } from "@/lib/picks/use-pick-sheet";
import { isVoid, voidNote } from "@/lib/slate/json";

type Status = "saved" | "saving" | "failed";

interface LocalPick {
  teamId: number;
  status: Status;
  error?: string;
}

/** Saves the sheet does not hold yet: in flight, or refused. Everything else is on the sheet. */
type Unsettled = Record<number, LocalPick | undefined>;

type LocalPicks = Record<number, LocalPick | undefined>;

/** How long the Saved chip shows before the flow moves on. */
const ADVANCE_DELAY_MS = 400;

const isSaved = (pick: LocalPick | undefined) => pick?.status === "saved";

/** Where the flow opens: the first game still to pick, or the top of the slate. */
function firstUnpicked(games: SheetGameJson[], picks: LocalPicks): number {
  const open = firstOpenGame(games, (gameId) => isSaved(picks[gameId]));
  return open ? games.indexOf(open) : 0;
}

/** A row is the shared Game-and-result pair plus the pick screen's detail; the id sits on the Game. */
const idOf = (view: SheetGameJson) => view.game.id;

function ProgressStrip({
  games,
  picks,
  current,
  onJump,
}: {
  games: SheetGameJson[];
  picks: LocalPicks;
  current: number;
  onJump: (index: number) => void;
}) {
  return (
    <nav aria-label="Games" className="flex gap-1 px-4">
      {games.map((g, i) => {
        const done = isSaved(picks[idOf(g)]);
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
export function PickFlow({
  sheet: initial,
  startGameId,
}: {
  sheet: SheetJson;
  startGameId?: number;
}) {
  const router = useRouter();
  const { sheet: held, locked, apply } = usePickSheet(initial);
  const games = held.games;
  const [unsettled, setUnsettled] = useState<Unsettled>({});
  // What the server holds, overlaid with the saves it has not answered yet. Only
  // the server's part counts as picked: an in-flight or failed save leaves its
  // game open here just as it does on the sheet.
  const picks: LocalPicks = {
    ...Object.fromEntries(held.picks.map((p) => [p.gameId, { teamId: p.teamId, status: "saved" as const }])),
    ...unsettled,
  };
  const [index, setIndex] = useState(() => {
    const requested = games.findIndex((g) => idOf(g) === startGameId);
    return requested === -1 ? firstUnpicked(games, picks) : requested;
  });
  const [lateError, setLateError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attempts = useRef(new Map<number, number>());

  useEffect(() => () => clearTimeout(advanceTimer.current), []);

  const view = games[index];
  const { game, detail } = view;
  const voided = isVoid(view);
  const why = voidNote(view);
  const pick = picks[game.id];
  const tiebreaker = game.id === held.tiebreakerGameId;
  const last = index + 1 >= games.length;
  // What the end of the slate still owes, counting this game as picked: `advance`
  // runs from the post-save timeout, whose closure caught `picks` before the save
  // landed, so without that the game just saved reads as open and sends the flow
  // back to itself.
  const openAfterThis = firstOpenGame(games, (gameId) => gameId === game.id || isSaved(picks[gameId]));

  const goTo = (i: number) => {
    clearTimeout(advanceTimer.current);
    setFlash(false);
    setIndex(i);
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
    const attemptId = (attempts.current.get(gameId) ?? 0) + 1;
    attempts.current.set(gameId, attemptId);
    clearTimeout(advanceTimer.current);
    setFlash(false);
    setUnsettled((u) => ({ ...u, [gameId]: { teamId, status: "saving" } }));

    const result = await put<SheetJson>("/api/week/picks", { gameId, teamId });
    // A newer tap on this same game supersedes this answer; other games are unaffected.
    if (attempts.current.get(gameId) !== attemptId) return;

    // A save takes only its own game onto the sheet: answers to different games
    // can arrive out of order, and the older must not roll back the newer. A 423
    // is the exception the hook handles: the Deadline passed under us, what the
    // server holds is what counts, and its refusal carries the sheet that says so.
    const now = apply(result, (h, body) => ({
      ...h,
      picks: [...h.picks.filter((p) => p.gameId !== gameId), { gameId, teamId, updatedAt: body.serverNow }],
    }));
    if (!result.ok && result.locked) setLateError(result.error);
    const failed = !result.ok && !result.locked;
    // Settled saves leave the overlay, or its `undefined` would hide the sheet's own pick.
    setUnsettled((u) => {
      const rest = { ...u };
      delete rest[gameId];
      return failed ? { ...rest, [gameId]: { teamId, status: "failed", error: result.error } } : rest;
    });
    if (!failed && now.picks.some((p) => p.gameId === gameId) && games[index]?.game.id === gameId) {
      setFlash(true);
      advanceTimer.current = setTimeout(() => {
        setFlash(false);
        advance();
      }, ADVANCE_DELAY_MS);
    }
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
            Game {index + 1} of {games.length}
          </div>
        </div>
        <HeaderLinks />
        <StatusChip pick={pick} />
      </header>

      <ProgressStrip games={games} picks={picks} current={index} onJump={goTo} />

      <div className="flex flex-1 flex-col gap-2 px-4 pb-3 pt-2">
        {locked ? (
          <div role="status" className="flex items-center gap-2 rounded-md bg-locked p-3 text-sm text-locked-foreground">
            <Lock size={16} />
            <span>
              Picks are locked. The deadline was <LocalTime at={held.deadline} style="deadline" />.
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
              ? last && !openAfterThis
                ? "Saved. On to review…"
                : "Saved. Next game…"
              : locked
                ? "Nothing more to enter this week."
                : voided
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
