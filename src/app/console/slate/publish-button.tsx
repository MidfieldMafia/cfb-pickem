"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { publishAction, type SlateActionState } from "./actions";

export function PublishButton({ weekId, gameCount }: { weekId: number; gameCount: number }) {
  const [state, action, pending] = useActionState<SlateActionState, FormData>(publishAction, {});

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="weekId" value={weekId} />
      <Button type="submit" className="w-full" disabled={pending || gameCount === 0}>
        {pending ? "Publishing…" : `Publish slate (${gameCount} game${gameCount === 1 ? "" : "s"})`}
      </Button>
      {state.error ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
