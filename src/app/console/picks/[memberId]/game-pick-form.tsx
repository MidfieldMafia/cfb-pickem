"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { TeamLogo } from "@/components/team-logo";
import { ActionMessage, type ActionState } from "../../action-form";
import { overridePickAction } from "../actions";

interface Team {
  id: number;
  name: string;
  rank: number | null;
}

/**
 * One game, two buttons: tapping a team saves it as the member's pick. The
 * submitting button carries the team id, so one form covers both sides.
 */
export function GamePickForm({
  hidden,
  away,
  home,
  picked,
}: {
  hidden: Record<string, number>;
  away: Team;
  home: Team;
  picked: number | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(overridePickAction, {});
  return (
    <form action={formAction} className="space-y-2">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <TeamButton team={away} picked={picked === away.id} pending={pending} />
        <span className="text-xs text-muted-foreground">at</span>
        <TeamButton team={home} picked={picked === home.id} pending={pending} />
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

function TeamButton({ team, picked, pending }: { team: Team; picked: boolean; pending: boolean }) {
  return (
    <Button
      type="submit"
      name="teamId"
      value={team.id}
      variant={picked ? "default" : "outline"}
      aria-pressed={picked}
      disabled={pending}
      className="h-11 justify-start gap-2 font-display font-black"
    >
      <TeamLogo team={team.name} size={20} />
      {team.rank ? <span className="text-xs font-bold opacity-70">#{team.rank}</span> : null}
      <span className="truncate">{team.name}</span>
    </Button>
  );
}
