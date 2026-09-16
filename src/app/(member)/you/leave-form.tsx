"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { JoinState } from "@/lib/groups/join-state";
import { leaveAction } from "./actions";

/** Leaving one group, behind a disclosure so it is never one stray tap. */
export function LeaveForm({ groupId, groupName }: { groupId: number; groupName: string }) {
  const [state, action, pending] = useActionState<JoinState, FormData>(leaveAction, {});
  return (
    <details>
      <summary className="flex min-h-tap cursor-pointer items-center text-sm font-semibold text-muted-foreground">
        Leave {groupName}
      </summary>
      <form action={action} className="space-y-2 pt-1">
        <input type="hidden" name="groupId" value={groupId} />
        <p className="text-xs text-muted-foreground">
          You disappear from its boards, past weeks included. Open its Join Link again to come back with everything
          you had.
        </p>
        <Button type="submit" size="sm" variant="destructive" disabled={pending}>
          {pending ? "Leaving…" : `Leave ${groupName}`}
        </Button>
        {state.error ? (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {state.error}
          </p>
        ) : null}
      </form>
    </details>
  );
}
