"use client";

import { useActionState, useState } from "react";
import { Button, Input } from "@saturday-slate/design-system";

import { ActionMessage, type ActionState } from "../action-form";
import { deleteGroupAction } from "./actions";

/**
 * Deleting a group cannot be undone — the memberships and the join dates that
 * decide which Weeks count go with it — so Delete stays disabled until the
 * group's name is typed. The server checks the same name: this is only the
 * button agreeing with it early.
 */
export function DeleteGroupForm({ groupId, name, warning }: { groupId: number; name: string; warning: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteGroupAction, {});
  const [typed, setTyped] = useState("");
  return (
    <form action={action} className="flex max-w-64 flex-col items-end gap-2 text-right">
      <input type="hidden" name="groupId" value={groupId} />
      <p className="text-xs text-muted-foreground">{warning}</p>
      <label className="w-full space-y-1 text-left text-xs font-semibold">
        Type {name} to delete it
        <Input name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </label>
      <Button type="submit" size="sm" variant="destructive" disabled={pending || typed.trim() !== name}>
        {pending ? "Deleting…" : "Delete group"}
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}
