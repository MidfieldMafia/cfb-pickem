"use client";

import { useActionState } from "react";
import { Button } from "@saturday-slate/design-system";

import { refreshAction, type SlateActionState } from "./actions";

export function RefreshButton({ weekId }: { weekId: number }) {
  const [state, action, pending] = useActionState<SlateActionState, FormData>(refreshAction, {});

  return (
    <>
      <form action={action} className="ml-auto">
        <input type="hidden" name="weekId" value={weekId} />
        <Button type="submit" variant="ghost" size="sm" disabled={pending}>
          {pending ? "Refreshing…" : "Refresh from feed"}
        </Button>
      </form>
      {state.error ? (
        <p role="alert" className="basis-full text-right text-sm font-semibold text-destructive">
          {state.error}
        </p>
      ) : null}
    </>
  );
}
