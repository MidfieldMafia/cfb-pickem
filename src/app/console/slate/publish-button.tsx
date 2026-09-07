"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { plural } from "@/lib/plural";
import { publishAction, type SlateActionState } from "./actions";

export function PublishButton({ weekId, gameCount }: { weekId: number; gameCount: number }) {
  const [state, action, pending] = useActionState<SlateActionState, FormData>(publishAction, {});

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="weekId" value={weekId} />
      <Button type="submit" className="w-full" disabled={pending || gameCount === 0}>
        <Send size={16} aria-hidden />
        {pending ? "Publishing…" : `Publish slate (${plural(gameCount, "game")})`}
      </Button>
      {state.error ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
