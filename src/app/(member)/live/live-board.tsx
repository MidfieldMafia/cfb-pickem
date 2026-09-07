"use client";

import { Check, Lock, LockOpen, Radio, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { BoardToggle } from "@/components/board-toggle";
import { LocalTime } from "@/components/local-time";
import { MemberChip } from "@/components/member-chip";
import { Pennant } from "@/components/pennant";
import { TeamLogo } from "@/components/team-logo";
import { TeamName } from "@/components/team-name";
import { Badge } from "@/components/ui/badge";
import { YourWeek } from "@/components/your-week";
import { clockLabel, type GameResult } from "@/lib/results/result";
import type { RevealGame, RevealPick, ScoredMember } from "@/lib/results/results";
import { sideStanding, type Side, type SideStanding } from "@/lib/results/side";
import { standing } from "@/lib/results/summary";
import { isVoid, type MemberJson } from "@/lib/slate/json";
import { fetchWeekState } from "@/lib/week/client";
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
 */
function useWeekState(initial: WeekStateJson): WeekStateJson {
  const [state, setState] = useState(initial);
  const etag = useRef<string | null>(null);

  useEffect(() => {
    const delay = nextPollMs(state);
    if (delay === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
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

  return state;
}

/** How each standing dresses a side: the ring on its pennants, and the mark beside them. */
const RING: Record<SideStanding, string> = {
  won: "ring-win",
  leading: "ring-win",
  lost: "ring-loss",
  trailing: "ring-loss",
  level: "ring-border",
  none: "ring-border",
};

function Mark({ standing }: { standing: SideStanding }) {
  if (standing === "won" || standing === "leading") {
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-win text-win-foreground">
        <Check size={12} strokeWidth={3} aria-hidden />
        <span className="sr-only">{standing === "won" ? "Won" : "Leading"}</span>
      </span>
    );
  }
  if (standing === "lost" || standing === "trailing") {
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-loss text-loss-foreground">
        <X size={12} strokeWidth={3} aria-hidden />
        <span className="sr-only">{standing === "lost" ? "Lost" : "Trailing"}</span>
      </span>
    );
  }
  // Holds the column so the scores line up whether or not a side has a mark yet.
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
  return (
    <div className="flex min-h-11 items-center gap-2">
      <TeamLogo team={team} size={28} />
      <TeamName name={team} rank={rank} className={`min-w-0 flex-1 truncate text-lg ${behind ? "text-muted-foreground" : ""}`} />
      {/* Overlapping pennants, the newest member on top: the row stays one line whoever picked. */}
      <ul className="flex items-center -space-x-1.5 pr-1">
        {took.map((pick) => {
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
  const place = state.scores ? standing(state.scores, viewerId) : null;
  if (!mine || !place) {
    return (
      <div className="rounded-md border border-border bg-card p-3">
        <p className="text-sm text-muted-foreground">
          You joined after this week&rsquo;s deadline, so Week {weekNumber} is not counted for or against you.
        </p>
      </div>
    );
  }
  return <YourWeek weekNumber={weekNumber} score={mine} place={place} />;
}

export function LiveBoard({ initial, viewer }: { initial: WeekStateJson; viewer: MemberJson }) {
  const state = useWeekState(initial);
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
