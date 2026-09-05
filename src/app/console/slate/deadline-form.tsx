"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setDeadlineAction, type SlateActionState } from "./actions";

/** datetime-local wants the viewer's wall-clock time without a zone. */
function toLocalInput(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(
    at.getMinutes(),
  )}`;
}

const subscribe = () => () => {};

/**
 * The visible field is in the viewer's time zone; the hidden field carries the
 * UTC instant the server acts on, so the server never guesses a zone.
 */
export function DeadlineForm({ weekId, deadline }: { weekId: number; deadline: Date }) {
  const [state, action, pending] = useActionState<SlateActionState, FormData>(setDeadlineAction, {});
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [iso, setIso] = useState(deadline.toISOString());

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="weekId" value={weekId} />
      <input type="hidden" name="deadline" value={iso} />
      <div className="flex gap-2">
        <Input
          key={mounted ? deadline.toISOString() : "server"}
          type="datetime-local"
          defaultValue={mounted ? toLocalInput(deadline) : ""}
          onChange={(e) => {
            const picked = new Date(e.target.value);
            if (!Number.isNaN(picked.getTime())) setIso(picked.toISOString());
          }}
          disabled={!mounted}
          required
          aria-label="Deadline"
        />
        <Button type="submit" variant="outline" disabled={pending || !mounted}>
          {pending ? "Saving…" : "Move"}
        </Button>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.done ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.done}
        </p>
      ) : null}
    </form>
  );
}
