"use client";

import { Check, ChevronRight, Lock, LockOpen, Radio, RefreshCw, Scale, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppHeader } from "@/components/app-header";
import { LocalTime } from "@/components/local-time";
import { MemberChip } from "@/components/member-chip";
import { Pennant } from "@/components/pennant";
import { TeamLogo } from "@/components/team-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useDeadlineClock } from "@/lib/picks/clock";
import { clockLabel, type GameResult } from "@/lib/results/result";
import type { RevealGame, RevealPick, ScoredMember, WeeklyScore } from "@/lib/results/results";
import { sideStanding, type SideStanding } from "@/lib/results/side";
import { record, standing } from "@/lib/results/summary";
import { plural } from "@/lib/plural";
import { isVoid, voidNote, type MemberJson } from "@/lib/slate/json";
import { fetchWeekState } from "@/lib/week/client";
import { agoLabel, dueInLabel } from "@/lib/week/freshness";
import type { WeekStateJson } from "@/lib/week/json";
import { nextPollMs } from "@/lib/week/poll";

/**
 * Keeps the state fresh. Asks again after `nextPollMs` of the state it holds,
 * carrying the ETag so an unchanged Week is a 304 and no re-render; goes
 * quiet while the tab is hidden and asks the moment it is back. A poll that
 * fails leaves the last state standing and tries again on the same cadence.
 *
 * Re-armed on every state change rather than on a fixed timer, because the
 * cadence itself is a function of the state: a kickoff moves it from five
 * minutes to thirty seconds, and the last final stops it.
 *
 * `nextPollAt` is the phone's own clock plus that same delay, stamped every
 * time a poll is scheduled — the freshness line's "next check" reads it
 * straight off, rather than re-deriving the cadence a second time (#95).
 */
function useWeekState(initial: WeekStateJson): { state: WeekStateJson; nextPollAt: number | null } {
  const [state, setState] = useState(initial);
  const [nextPollAt, setNextPollAt] = useState<number | null>(null);
  const etag = useRef<string | null>(null);

  useEffect(() => {
    const delay = nextPollMs(state);
    // Null only once `state.complete`, at which point `LiveBoard` stops
    // rendering the freshness line altogether — a stale `nextPollAt` here is
    // inert, so there is nothing to reset it to.
    if (delay === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      setNextPollAt(Date.now() + delay);
      timer = setTimeout(() => void poll(), delay);
    };
    const poll = async () => {
      // A hidden tab does not poll; `visibilitychange` picks it up on return.
      if (document.visibilityState === "hidden") return;
      const result = await fetchWeekState(etag.current);
      if (cancelled) return;
      if (result.kind === "fresh") {
        etag.current = result.etag;
        setState(result.state);
        return; // the new state re-runs this effect and schedules the next poll on its own cadence
      }
      schedule();
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      void poll();
    };

    document.addEventListener("visibilitychange", onVisibility);
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [state]);

  return { state, nextPollAt };
}

/**
 * The reassurance Norah asked pull-to-refresh for (#95): when the scores on
 * screen were last confirmed current, and when the next check is due. Ticks
 * on its own between polls rather than freezing at the render that set it —
 * `useDeadlineClock` already does exactly that against the server's clock, so
 * this reads it backwards: "remaining" to a `serverNow` already in the past
 * is the negative of how long ago it was. `nextPollAt` is the phone's own
 * clock, so it needs no such correction.
 *
 * Rendered only while there is still something to poll for; once the Week is
 * complete there is nothing left to go stale, and the games' own "Final"
 * already says so.
 */
const subscribeEverySecond = (onTick: () => void) => {
  const timer = setInterval(onTick, 1000);
  return () => clearInterval(timer);
};

function FreshnessLine({ serverNow, nextPollAt }: { serverNow: string; nextPollAt: number | null }) {
  const { remainingMs } = useDeadlineClock(serverNow, serverNow);
  const elapsedMs = Math.max(0, -remainingMs);
  // `nextPollAt` is stamped on the phone's own clock, so ticking this against
  // it needs no server-offset correction — just a re-render every second,
  // read the sanctioned way rather than calling `Date.now()` in the render body.
  const clientNow = useSyncExternalStore(subscribeEverySecond, () => Date.now(), () => 0);
  const dueInMs = nextPollAt === null ? null : Math.max(0, nextPollAt - clientNow);
  return (
    <p className="flex items-center gap-1 text-xs text-muted-foreground">
      <RefreshCw size={11} aria-hidden />
      Updated {agoLabel(elapsedMs)}
      {dueInMs === null ? null : ` · next check ${dueInLabel(dueInMs)}`}
    </p>
  );
}

/**
 * The viewer's own place in the Week so far: pinned above the games so it
 * never scrolls out of reach. Reads `state.scores` rather than the season —
 * the season card was mockup 05's own earlier draft; this Week is the stake
 * on a Saturday.
 */
function YourRank({ state, viewer }: { state: WeekStateJson; viewer: MemberJson }) {
  if (!state.locked) {
    return (
      <div className="rounded-md border border-border bg-card p-3">
        <p className="text-sm font-semibold">
          Picks lock <LocalTime at={state.deadline} style="deadline" />
        </p>
        <p className="text-sm text-muted-foreground">Everyone&rsquo;s picks show here once they do.</p>
      </div>
    );
  }
  const scores = state.scores ?? [];
  const mine = scores.find((s) => s.member.id === viewer.id);
  const place = mine ? standing(scores, viewer.id) : null;
  // No weekly score and no place are the same member: one who joined after
  // this Deadline and so is on neither board.
  if (!mine || !place) {
    return (
      <div className="rounded-md border border-border bg-card p-3">
        <p className="text-sm text-muted-foreground">
          You joined after this week&rsquo;s deadline, so Week {state.week.weekNumber} is not counted for or against you.
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-xl bg-primary p-3 text-primary-foreground">
      <Pennant avatarId={viewer.avatarId} size={40} />
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5">
        <span className="text-xs font-bold uppercase tracking-[0.08em] opacity-85">You · Week {state.week.weekNumber}</span>
        <span className="text-right text-xs font-bold uppercase tracking-[0.08em] tabular-nums opacity-85">
          {record(mine.correct, mine.incorrect)} so far
        </span>
        <span className="font-display text-2xl font-black">{place.label}</span>
        <span className="text-right font-display text-2xl font-black tabular-nums">{mine.points} pts</span>
      </div>
    </div>
  );
}

/** Live first, then what hasn't kicked off, then finals and voids — the board should lead with the action. */
function orderKey(result: GameResult): number {
  if (result.status === "void") return 3;
  if (result.status === "final") return 2;
  return result.live ? 0 : 1;
}

/**
 * "Georgia -6.5" → "-6.5" on Georgia's line, "+6.5" on the other; "Pick" →
 * "PK" on both; null when nobody has set one yet.
 *
 * `spreadText` (cfbd/details.ts) writes a plain ASCII hyphen for the
 * win-probability model's fallback line; a sportsbook's own `formattedSpread`
 * is free-form text from the feed, so both a hyphen and a proper minus sign
 * are matched here rather than assuming one.
 */
function spreadLabel(spread: string | null, team: string): string {
  if (spread === null) return "–";
  if (spread === "Pick") return "PK";
  const favored = spread.startsWith(team);
  const number = spread.replace(/^.*\s(?=[-−+])/, "");
  return favored ? number : `+${number.replace(/^[-−]/, "")}`;
}

function ownPick(row: RevealGame, viewerId: number): RevealPick | undefined {
  return row.picks.find((p) => p.memberId === viewerId);
}

/** Your pick, in the same language the drawer uses: hollow until the game is decided, filled green when it hits, red when it misses. */
function PickMark({ pick }: { pick: RevealPick }) {
  const settled = pick.outcome === "correct" || pick.outcome === "incorrect";
  const right = pick.outcome === "correct";
  const what = pick.lock === "counts" ? "Your Lock of the Week" : pick.lock === "dropped" ? "Your dropped Lock of the Week" : "Your pick";
  const label = settled ? `${what} ${right ? "won" : "lost"}` : what;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5" title={label} aria-label={label}>
      <span
        className={`grid size-5 place-items-center rounded-full ${
          !settled
            ? "border-2 border-primary text-primary"
            : right
              ? "bg-win text-win-foreground"
              : "bg-loss text-loss-foreground"
        }`}
      >
        {settled && !right ? <X size={12} strokeWidth={3} aria-hidden /> : <Check size={12} strokeWidth={3} aria-hidden />}
      </span>
      {pick.lock === "counts" ? (
        <Lock size={15} strokeWidth={2.5} className={settled ? (right ? "text-win" : "text-loss") : "text-secondary"} aria-hidden />
      ) : null}
      {pick.lock === "dropped" ? <LockOpen size={15} strokeWidth={2.5} className="text-muted-foreground" aria-hidden /> : null}
    </span>
  );
}

/**
 * One compact line per side: logo, rank, name with your own pick marked, and
 * the score or the spread.
 *
 * `final` recedes the whole line once the game is decided — the score drops
 * its bold weight and always reads muted, on top of (not instead of) `dim`,
 * which still marks the losing side on its own (#93).
 */
function SideLine({
  team,
  rank,
  teamId,
  score,
  spread,
  dim,
  final,
  pick,
}: {
  team: string;
  rank: number | null;
  teamId: number;
  score: number | null;
  spread: string | null;
  dim: boolean;
  final: boolean;
  pick: RevealPick | undefined;
}) {
  const mine = pick && pick.teamId === teamId && pick.outcome !== "void" && pick.outcome !== "unpicked" ? pick : undefined;
  const favored = spread !== null && spread !== "Pick" && spread.startsWith(team);
  return (
    <div className="grid min-h-8 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
      <TeamLogo team={team} size={22} className={dim || final ? "opacity-50" : ""} />
      <span className="flex min-w-0 items-center gap-1.5">
        {rank ? <span className="shrink-0 text-xs font-bold tabular-nums text-muted-foreground">#{rank}</span> : null}
        <span className={`truncate font-display text-[17px] font-black ${dim || final ? "text-muted-foreground" : "text-foreground"}`}>
          {team}
        </span>
        {mine ? <PickMark pick={mine} /> : null}
      </span>
      {score === null ? (
        <span
          className={`min-w-8 text-right font-display text-[17px] tabular-nums ${favored ? "text-foreground" : "text-muted-foreground"}`}
        >
          {spreadLabel(spread, team)}
        </span>
      ) : (
        <span
          className={`min-w-8 text-right font-display text-2xl tabular-nums ${
            final ? "font-bold text-muted-foreground" : `font-black ${dim ? "text-muted-foreground" : "text-foreground"}`
          }`}
        >
          {score}
        </span>
      )}
    </div>
  );
}

/**
 * The pick split across the two sides. Two design-system tones rather than
 * school colors: the app has no per-team color data.
 *
 * `muted` fades it for a final game — the split mattered while the outcome
 * was open; once decided it is trivia, not a cue, and full-strength color
 * here would fight the rest of the receded card.
 */
function SplitBar({
  away,
  home,
  awayTeam,
  homeTeam,
  muted,
}: {
  away: number;
  home: number;
  awayTeam: string;
  homeTeam: string;
  muted: boolean;
}) {
  const total = away + home || 1;
  return (
    <span
      role="img"
      aria-label={`${plural(away, "pick")} on ${awayTeam}, ${plural(home, "pick")} on ${homeTeam}`}
      className={`flex h-1 overflow-hidden rounded-full bg-border ${muted ? "opacity-50" : ""}`}
    >
      <span className="bg-primary" style={{ width: `${(away / total) * 100}%` }} />
      <span className="flex-1 bg-secondary" />
    </span>
  );
}

/**
 * One game on the board: tap it for the full picture in `GameSheet`.
 *
 * A final game recedes in place — muted card fill, faint border, quieter
 * split bar — so it reads as done at a glance without a shape change that
 * would reflow the list under a mid-scroll reader (#93). Void keeps its own,
 * stronger recede (the whole card at reduced opacity); the two never overlap
 * since a Void game's `result.status` is `"void"`, not `"final"`.
 */
function GameRow({
  row,
  viewerId,
  onOpen,
}: {
  row: RevealGame;
  viewerId: number;
  onOpen: () => void;
}) {
  const { game, result } = row;
  const mine = ownPick(row, viewerId);
  const awayPicks = row.picks.filter((p) => p.teamId === game.awayTeamId).length;
  const homePicks = row.picks.filter((p) => p.teamId === game.homeTeamId).length;
  const awaySide = sideStanding(result, "away");
  const homeSide = sideStanding(result, "home");
  const earned = mine?.outcome === "correct" ? mine.points : null;
  const final = result.status === "final";

  return (
    <li className={isVoid(row) ? "opacity-70" : ""}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${game.awayTeam} at ${game.homeTeam}, details`}
        className={`grid w-full gap-1.5 rounded-md border p-3 text-left ${
          final ? "border-border/50 bg-muted/30" : "border-border bg-card"
        }`}
      >
        <div className="flex min-h-5 items-center gap-2">
          <span className="flex-1 truncate text-xs text-muted-foreground">
            {result.status === "pending" && !result.live ? (
              <LocalTime at={game.kickoff} style="slot" />
            ) : result.status === "final" ? (
              result.label
            ) : null}
          </span>
          {result.live ? (
            <Badge variant="live">
              <Radio size={12} aria-hidden />
              {clockLabel(result.live) ?? result.label}
            </Badge>
          ) : null}
          {isVoid(row) ? <Badge variant="void">Void{voidNote(row) ? `: ${voidNote(row)}` : ""}</Badge> : null}
          {earned !== null ? (
            <span className="rounded-full bg-win px-2 py-0.5 font-display text-xs font-black text-win-foreground">
              +{earned}
            </span>
          ) : null}
          <ChevronRight size={16} className="shrink-0 text-muted-foreground" aria-hidden />
        </div>
        <SideLine
          team={game.awayTeam}
          rank={game.awayRank}
          teamId={game.awayTeamId}
          score={result.shown?.awayScore ?? null}
          spread={game.spread}
          dim={awaySide === "lost"}
          final={final}
          pick={mine}
        />
        <SideLine
          team={game.homeTeam}
          rank={game.homeRank}
          teamId={game.homeTeamId}
          score={result.shown?.homeScore ?? null}
          spread={game.spread}
          dim={homeSide === "lost"}
          final={final}
          pick={mine}
        />
        <SplitBar
          away={awayPicks}
          home={homePicks}
          awayTeam={game.awayTeam}
          homeTeam={game.homeTeam}
          muted={final}
        />
      </button>
    </li>
  );
}

const STANDING_BORDER: Record<SideStanding, string> = {
  won: "border-win",
  lost: "border-loss/40",
  leading: "border-border",
  trailing: "border-border",
  level: "border-border",
  none: "border-border",
};

/** One side of the sheet: who took it, ringed by how it's doing, with a chip per member. */
function SidePanel({
  team,
  rank,
  teamId,
  standingWord,
  picks,
  members,
  viewerId,
  total,
}: {
  team: string;
  rank: number | null;
  teamId: number;
  standingWord: SideStanding;
  picks: RevealPick[];
  members: Map<number, ScoredMember>;
  viewerId: number;
  total: number;
}) {
  return (
    <div className={`grid gap-2 rounded-md border bg-card p-2.5 ${STANDING_BORDER[standingWord]}`}>
      <div className="flex items-center gap-2">
        <TeamLogo team={team} size={24} />
        {rank ? <span className="text-xs font-bold tabular-nums text-muted-foreground">#{rank}</span> : null}
        <span className="min-w-0 flex-1 truncate font-display text-[17px] font-black">{team}</span>
        {standingWord === "won" ? <Badge variant="win">Won</Badge> : null}
        {standingWord === "lost" ? <Badge variant="loss">Lost</Badge> : null}
        {standingWord === "leading" ? <Badge variant="outline">Leading</Badge> : null}
        {standingWord === "trailing" ? <Badge variant="outline">Trailing</Badge> : null}
        {total > 0 ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            {picks.length} of {total}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {total === 0 ? (
          <span className="text-sm text-muted-foreground">Picks aren&rsquo;t visible yet.</span>
        ) : picks.length === 0 ? (
          <span className="text-sm text-muted-foreground">Nobody picked this side.</span>
        ) : null}
        {picks
          .filter((p) => p.teamId === teamId)
          .map((pick) => {
            const member = members.get(pick.memberId);
            if (!member) return null;
            const you = pick.memberId === viewerId;
            return (
              <span
                key={pick.memberId}
                className={`inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 ${
                  you ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                }`}
              >
                <Pennant avatarId={member.avatarId} size={20} />
                <span className={`text-xs ${you ? "font-extrabold" : "font-semibold"}`}>{you ? "You" : member.displayName}</span>
                {pick.lock === "counts" ? (
                  <Lock size={12} strokeWidth={3} aria-label="Lock of the Week" />
                ) : null}
                {pick.lock === "dropped" ? (
                  <LockOpen
                    size={12}
                    strokeWidth={3}
                    className={you ? "" : "text-muted-foreground"}
                    aria-label="Lock of the Week, dropped: the game is void"
                  />
                ) : null}
              </span>
            );
          })}
      </div>
    </div>
  );
}

/** Everyone's Tiebreaker Guess, closest first once the game is final. */
function TiebreakerSection({ game, scores, viewerId }: { game: RevealGame; scores: WeeklyScore[]; viewerId: number }) {
  const final = game.result.status === "final";
  const combined = final && game.result.shown ? game.result.shown.homeScore + game.result.shown.awayScore : null;
  const guessed = scores.filter((s) => s.tiebreakerGuess !== null);
  const sorted = [...guessed].sort((a, b) =>
    final ? (a.tiebreakerError ?? Infinity) - (b.tiebreakerError ?? Infinity) : a.tiebreakerGuess! - b.tiebreakerGuess!,
  );
  const missing = scores.length - guessed.length;
  return (
    <div className="grid gap-2 rounded-md border border-secondary bg-card p-2.5">
      <div className="flex items-baseline gap-2">
        <span className="flex-1 text-xs font-bold uppercase tracking-[0.08em] text-secondary">Tiebreaker Guesses</span>
        <span className="text-xs text-muted-foreground">{combined !== null ? `Finished ${combined}` : "Combined final score"}</span>
      </div>
      <div className="grid gap-0.5">
        {sorted.map((s) => {
          const you = s.member.id === viewerId;
          return (
            <div key={s.member.id} className={`flex min-h-8 items-center gap-2 rounded-md px-1.5 ${you ? "bg-accent" : ""}`}>
              <Pennant avatarId={s.member.avatarId} size={20} />
              <span className={`min-w-0 flex-1 truncate text-sm ${you ? "font-extrabold" : "font-semibold"}`}>
                {you ? "You" : s.member.displayName}
              </span>
              {final ? <span className="text-xs tabular-nums text-muted-foreground">off by {s.tiebreakerError}</span> : null}
              <span className="font-display text-[15px] tabular-nums">{s.tiebreakerGuess}</span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Closest guess breaks a tie on points.{" "}
        {missing > 0 ? `${plural(missing, "member")} ${missing === 1 ? "has" : "have"} not guessed yet.` : "Everyone has guessed."}
      </p>
    </div>
  );
}

/** Tap a game for the full picture: everyone's pick, Locks, and the Tiebreaker Guesses. */
function GameSheet({
  game,
  members,
  scores,
  viewerId,
  tiebreakerGameId,
  onClose,
}: {
  game: RevealGame | null;
  members: Map<number, ScoredMember>;
  scores: WeeklyScore[] | null;
  viewerId: number;
  tiebreakerGameId: number | null;
  onClose: () => void;
}) {
  return (
    <Drawer open={game !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DrawerContent className="mx-auto max-w-md">
        {game ? (
          <>
            <DrawerHeader>
              <DrawerTitle>
                <span className="inline-flex items-center gap-2">
                  {game.game.awayTeam} at {game.game.homeTeam}
                  {game.game.id === tiebreakerGameId ? <Scale size={16} className="text-secondary" aria-hidden /> : null}
                </span>
              </DrawerTitle>
              <DrawerDescription>
                {game.result.status === "final" && game.result.shown
                  ? `Final · ${game.result.shown.awayScore}–${game.result.shown.homeScore}`
                  : game.result.live
                    ? `${clockLabel(game.result.live) ?? game.result.label} · ${game.result.live.awayScore}–${game.result.live.homeScore}`
                    : game.result.status === "void"
                      ? "Postponed, scores zero for everyone"
                      : <LocalTime at={game.game.kickoff} style="slot" />}
              </DrawerDescription>
            </DrawerHeader>
            <div className="grid gap-2.5 overflow-y-auto px-4 pb-2" style={{ maxHeight: "calc(100dvh - 240px)" }}>
              <SidePanel
                team={game.game.awayTeam}
                rank={game.game.awayRank}
                teamId={game.game.awayTeamId}
                standingWord={sideStanding(game.result, "away")}
                picks={game.picks}
                members={members}
                viewerId={viewerId}
                total={members.size}
              />
              <SidePanel
                team={game.game.homeTeam}
                rank={game.game.homeRank}
                teamId={game.game.homeTeamId}
                standingWord={sideStanding(game.result, "home")}
                picks={game.picks}
                members={members}
                viewerId={viewerId}
                total={members.size}
              />
              {game.game.id === tiebreakerGameId && scores ? (
                <TiebreakerSection game={game} scores={scores} viewerId={viewerId} />
              ) : null}
              <p className="text-xs text-muted-foreground">A padlock marks that member&rsquo;s Lock of the Week.</p>
            </div>
          </>
        ) : null}
        <DrawerFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

export function LiveBoard({
  initial,
  viewer,
  commissioner,
}: {
  initial: WeekStateJson;
  viewer: MemberJson;
  commissioner?: boolean;
}) {
  const { state, nextPollAt } = useWeekState(initial);
  const [openGameId, setOpenGameId] = useState<number | null>(null);
  const members = new Map(state.members.map((m) => [m.id, m]));
  const weekNumber = state.week.weekNumber;
  const sub = state.locked
    ? state.complete
      ? `Week ${weekNumber} · Final`
      : `Week ${weekNumber} · Reveal is on, everyone’s picks are visible`
    : `Week ${weekNumber} · Picks are still open`;
  // Ordered once, from the page's first paint, and never again: a poll that
  // moves a game to final must not move it under a member mid-scan (#93). The
  // boundary this waits for is a fresh mount — leaving the screen and coming
  // back, not a background poll. Re-sorting on an explicit pull-to-refresh
  // would be the natural trigger once one exists; there isn't one yet.
  const [gameOrder] = useState<number[]>(() =>
    [...initial.games].sort((a, b) => orderKey(a.result) - orderKey(b.result)).map((g) => g.game.id),
  );
  const byId = new Map(state.games.map((g) => [g.game.id, g]));
  const ordered = gameOrder.map((id) => byId.get(id)).filter((g): g is RevealGame => g !== undefined);
  const openGame = state.games.find((g) => g.game.id === openGameId) ?? null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 pb-8">
      <AppHeader title="Live Board" sub={sub} commissioner={commissioner} right={<MemberChip member={viewer} />} />

      {/* Stays put while the games scroll: the freshness line and the viewer's own rank are the header of every card below. */}
      <div className="sticky top-0 z-10 space-y-3 border-b border-border bg-background px-4 pb-3">
        {state.complete ? null : <FreshnessLine serverNow={state.serverNow} nextPollAt={nextPollAt} />}
        <YourRank state={state} viewer={viewer} />
      </div>

      <ul className="space-y-3 px-4">
        {ordered.map((row) => (
          <GameRow key={row.game.id} row={row} viewerId={viewer.id} onOpen={() => setOpenGameId(row.game.id)} />
        ))}
      </ul>

      <GameSheet
        game={openGame}
        members={members}
        scores={state.scores}
        viewerId={viewer.id}
        tiebreakerGameId={state.week.tiebreakerGameId}
        onClose={() => setOpenGameId(null)}
      />
    </main>
  );
}
