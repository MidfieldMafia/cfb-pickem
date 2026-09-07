import { Check, Lock, LockOpen, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LocalTime } from "@/components/local-time";
import { Pennant } from "@/components/pennant";
import { SECTION_LABEL as LABEL } from "@/components/section-label";
import { TeamLogo } from "@/components/team-logo";
import type { Reveal, RevealPick, ScoredMember } from "@/lib/results/results";
import { isVoid } from "@/lib/slate/json";

/** The chip that sums up one side: "✓ 4 picks" once the game is final, "4 picks" before. */
function SideChip({ picks, outcome }: { picks: RevealPick[]; outcome: RevealPick["outcome"] | null }) {
  const count = picks.length;
  const label = `${count} pick${count === 1 ? "" : "s"}`;
  if (outcome === "correct") {
    return (
      <Badge className="bg-win text-win-foreground">
        <Check strokeWidth={3} /> {label}
      </Badge>
    );
  }
  if (outcome === "incorrect") {
    return (
      <Badge className="bg-loss text-loss-foreground">
        <X strokeWidth={3} /> {label}
      </Badge>
    );
  }
  return <Badge variant="outline">{label}</Badge>;
}

function Side({
  team,
  rank,
  score,
  picks,
  members,
  final,
  viewerId,
}: {
  team: string;
  rank: number | null;
  score: number | null;
  picks: RevealPick[];
  members: Map<number, ScoredMember>;
  final: boolean;
  viewerId: number;
}) {
  const outcome = final && picks.length > 0 ? picks[0].outcome : null;
  const tone =
    outcome === "correct" ? "border-win" : outcome === "incorrect" ? "border-loss/40 text-muted-foreground" : "border-border";
  return (
    <div className={`flex min-w-0 flex-1 flex-col gap-2 rounded-md border bg-card p-3 ${tone}`}>
      <div className="flex items-start justify-between gap-2">
        <TeamLogo team={team} size={36} />
        {score !== null ? <span className="font-display text-2xl font-black tabular-nums">{score}</span> : null}
      </div>
      <p className="font-display text-lg font-black leading-tight">
        {rank ? <span className="mr-1 text-xs font-bold text-muted-foreground">#{rank}</span> : null}
        {team}
      </p>
      <SideChip picks={picks} outcome={outcome} />
      <ul className="flex flex-wrap gap-1.5">
        {picks.map((pick) => {
          const member = members.get(pick.memberId);
          if (!member) return null;
          const you = pick.memberId === viewerId;
          return (
            <li
              key={pick.memberId}
              className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs font-semibold ${
                you ? "border-primary" : "border-border"
              }`}
              title={`${member.displayName}${pick.locked ? " · Lock of the Week" : ""}${
                pick.lockDropped ? " · Lock of the Week, dropped: the game is void" : ""
              }`}
            >
              <Pennant avatarId={member.avatarId} size={20} />
              <span className="max-w-24 truncate">{you ? "You" : member.displayName}</span>
              {pick.locked ? <Lock size={12} aria-label="Lock of the Week" /> : null}
              {pick.lockDropped ? (
                <LockOpen size={12} className="text-muted-foreground" aria-label="Lock of the Week, dropped: the game is void" />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Every member's pick per game, graded once the game is final. Rendered on /week after the Deadline. */
export function RevealList({ reveal, viewerId }: { reveal: Reveal; viewerId: number }) {
  const members = new Map(reveal.members.map((m) => [m.id, m]));
  return (
    <section className="space-y-3">
      <p className={LABEL}>Reveal · every game</p>
      <ul className="space-y-3">
        {reveal.games.map((row) => {
          const { game, result } = row;
          const final = result.status === "final";
          const away = row.picks.filter((p) => p.teamId === game.awayTeamId);
          const home = row.picks.filter((p) => p.teamId === game.homeTeamId);
          return (
            <li key={game.id} className={`space-y-2 ${isVoid(row) ? "opacity-70" : ""}`}>
              <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                <span>
                  {result.label}
                  {isVoid(row) && result.note ? ` · ${result.note}` : ""}
                </span>
                <span>·</span>
                <LocalTime at={game.kickoff} style="slot" />
                {game.id === reveal.week.tiebreakerGameId ? <Badge variant="outline">Tiebreaker</Badge> : null}
              </p>
              <div className="flex gap-2">
                <Side
                  team={game.awayTeam}
                  rank={game.awayRank}
                  score={result.shown?.awayScore ?? null}
                  picks={away}
                  members={members}
                  final={final}
                  viewerId={viewerId}
                />
                <Side
                  team={game.homeTeam}
                  rank={game.homeRank}
                  score={result.shown?.homeScore ?? null}
                  picks={home}
                  members={members}
                  final={final}
                  viewerId={viewerId}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
