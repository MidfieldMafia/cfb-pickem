"use client";

import { Check, Lock, LockOpen, Radio, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppHeader } from "@/components/app-header";
import { BoardToggle } from "@/components/board-toggle";
import { LocalTime } from "@/components/local-time";
import { MemberChip } from "@/components/member-chip";
import { Pennant } from "@/components/pennant";
import { TeamLogo } from "@/components/team-logo";
import { TeamName } from "@/components/team-name";
import { Badge } from "@/components/ui/badge";
import { YourSeason } from "@/components/standing-card";
import { useDeadlineClock } from "@/lib/picks/clock";
import { clockLabel, type GameResult } from "@/lib/results/result";
import type { RevealGame, RevealPick, ScoredMember } from "@/lib/results/results";
import { pennantRow, sideStanding, type Side, type SideStanding } from "@/lib/results/side";
import { plural } from "@/lib/plural";
import { isVoid, type MemberJson } from "@/lib/slate/json";
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
 * How each standing dresses a side: the ring on its pennants, and the mark
 * beside them. Final-only — `leading`/`trailing` get neither a coloured ring
 * nor a mark, so a game in progress cannot be misread as graded. The dimmed
 * trailing team (`behind` in `SideRow`) is the only in-progress signal; the
 * ring and the glyph both wait for `won`/`lost`.
 */
const RING: Record<SideStanding, string> = {
  won: "ring-win",
  leading: "ring-border",
  lost: "ring-loss",
  trailing: "ring-border",
  level: "ring-border",
  none: "ring-border",
};

function Mark({ standing }: { standing: SideStanding }) {
  if (standing === "won") {
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-win text-win-foreground">
        <Check size={12} strokeWidth={3} aria-hidden />
        <span className="sr-only">Won</span>
      </span>
    );
  }
  if (standing === "lost") {
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-loss text-loss-foreground">
        <X size={12} strokeWidth={3} aria-hidden />
        <span className="sr-only">Lost</span>
      </span>
    );
  }
  // Holds the column so the scores line up whether or not a side has a mark yet.
  // Also what a `leading`/`trailing` side gets: no mark until the game is final.
  return <span className="size-5 shrink-0" aria-hidden />;
}

/** One member on a side: their pennant, ringed by how the side is doing, with the Lock on it if it is theirs. */
function PickAvatar({
  pick,
  member,
  you,
  ring,
}: {
  pick: RevealPick;
  member: ScoredMember;
  you: boolean;
  ring: string;
}) {
  const lock =
    pick.lock === "counts"
      ? "Lock of the Week"
      : pick.lock === "dropped"
        ? "Lock of the Week, dropped: the game is void"
        : null;
  return (
    <li className="relative" title={`${member.displayName}${lock ? ` · ${lock}` : ""}`}>
      <span className={`block rounded-full bg-card ring-2 ${ring} ${you ? "ring-offset-2 ring-offset-background" : ""}`}>
        <Pennant avatarId={member.avatarId} size={28} />
      </span>
      {lock ? (
        <span className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-secondary text-secondary-foreground">
          {pick.lock === "counts" ? <Lock size={9} aria-hidden /> : <LockOpen size={9} aria-hidden />}
        </span>
      ) : null}
      <span className="sr-only">
        {you ? "You" : member.displayName}
        {lock ? `, ${lock}` : ""}
      </span>
    </li>
  );
}

function SideRow({
  side,
  row,
  members,
  viewerId,
}: {
  side: Side;
  row: RevealGame;
  members: Map<number, ScoredMember>;
  viewerId: number;
}) {
  const { game, result } = row;
  const team = side === "home" ? game.homeTeam : game.awayTeam;
  const rank = side === "home" ? game.homeRank : game.awayRank;
  const teamId = side === "home" ? game.homeTeamId : game.awayTeamId;
  const score = result.shown ? (side === "home" ? result.shown.homeScore : result.shown.awayScore) : null;
  const stands = sideStanding(result, side);
  const behind = stands === "lost" || stands === "trailing";
  const took = row.picks.filter((p) => p.teamId === teamId);
  const { shown, hidden } = pennantRow(took, viewerId);
  return (
    <div className="flex min-h-11 items-center gap-2">
      <TeamLogo team={team} size={28} />
      <TeamName name={team} rank={rank} className={`min-w-0 flex-1 truncate text-lg ${behind ? "text-muted-foreground" : ""}`} />
      {/* Overlapping pennants, the newest member on top: the row stays one line whoever picked. */}
      <ul className="flex shrink-0 items-center -space-x-1.5 pr-1">
        {shown.map((pick) => {
          const member = members.get(pick.memberId);
          if (!member) return null;
          return (
            <PickAvatar
              key={pick.memberId}
              pick={pick}
              member={member}
              you={pick.memberId === viewerId}
              ring={RING[stands]}
            />
          );
        })}
        {hidden > 0 ? (
          <li
            className={`grid size-7 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-bold tabular-nums text-muted-foreground ring-2 ${RING[stands]}`}
          >
            <span aria-hidden>+{hidden}</span>
            <span className="sr-only">and {plural(hidden, "other member")}</span>
          </li>
        ) : null}
      </ul>
      <Mark standing={stands} />
      <span
        className={`w-10 text-right font-display text-2xl font-black tabular-nums ${behind ? "text-muted-foreground" : ""}`}
      >
        {score ?? ""}
      </span>
    </div>
  );
}

/** The line above the two sides: the clock while the game is going, the kickoff before it, the result's word otherwise. */
function StatusLine({ result, kickoff }: { result: GameResult; kickoff: string }) {
  if (result.live) {
    return (
      <Badge className="bg-live text-live-foreground">
        <Radio size={12} aria-hidden />
        {clockLabel(result.live) ?? result.label}
      </Badge>
    );
  }
  if (result.status === "pending") return <LocalTime at={kickoff} style="slot" />;
  return (
    <span>
      {result.label}
      {result.status === "void" && result.note ? ` · ${result.note}` : ""}
    </span>
  );
}

function GameCard({
  row,
  tiebreaker,
  members,
  viewerId,
}: {
  row: RevealGame;
  tiebreaker: boolean;
  members: Map<number, ScoredMember>;
  viewerId: number;
}) {
  return (
    <li className={`space-y-1 rounded-md border border-border bg-card p-3 ${isVoid(row) ? "opacity-70" : ""}`}>
      <div className="flex min-h-6 items-center justify-between gap-2 text-sm text-muted-foreground">
        <StatusLine result={row.result} kickoff={row.game.kickoff} />
        {tiebreaker ? <Badge variant="outline">Tiebreaker</Badge> : null}
      </div>
      <SideRow side="away" row={row} members={members} viewerId={viewerId} />
      <SideRow side="home" row={row} members={members} viewerId={viewerId} />
    </li>
  );
}

/** The card under the toggle: the viewer's own week while it counts, and why not when it does not. */
function YourCard({ state, viewerId }: { state: WeekStateJson; viewerId: number }) {
  const weekNumber = state.week.weekNumber;
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
  const mine = state.scores?.find((s) => s.member.id === viewerId) ?? null;
  // No weekly score and no season place are the same member: one who joined
  // after this Deadline and so is on neither board.
  if (!mine || !state.season) {
    return (
      <div className="rounded-md border border-border bg-card p-3">
        <p className="text-sm text-muted-foreground">
          You joined after this week&rsquo;s deadline, so Week {weekNumber} is not counted for or against you.
        </p>
      </div>
    );
  }
  return <YourSeason season={state.season} score={mine} />;
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

export function LiveBoard({ initial, viewer }: { initial: WeekStateJson; viewer: MemberJson }) {
  const { state, nextPollAt } = useWeekState(initial);
  const members = new Map(state.members.map((m) => [m.id, m]));
  const weekNumber = state.week.weekNumber;
  const sub = state.locked
    ? state.complete
      ? `Week ${weekNumber} · Final`
      : `Week ${weekNumber} · Reveal is on, everyone’s picks are visible`
    : `Week ${weekNumber} · Picks are still open`;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 pb-8">
      <AppHeader title="Live Board" sub={sub} right={<MemberChip member={viewer} />} />

      {/* Stays put while the games scroll: the toggle and the viewer's own line are the header of every card below. */}
      <div className="sticky top-0 z-10 space-y-3 border-b border-border bg-background px-4 pb-3">
        <BoardToggle active="live" weekNumber={state.locked ? weekNumber : null} />
        {state.complete ? null : <FreshnessLine serverNow={state.serverNow} nextPollAt={nextPollAt} />}
        <YourCard state={state} viewerId={viewer.id} />
      </div>

      <ul className="space-y-3 px-4">
        {state.games.map((row) => (
          <GameCard
            key={row.game.id}
            row={row}
            tiebreaker={row.game.id === state.week.tiebreakerGameId}
            members={members}
            viewerId={viewer.id}
          />
        ))}
      </ul>
    </main>
  );
}
