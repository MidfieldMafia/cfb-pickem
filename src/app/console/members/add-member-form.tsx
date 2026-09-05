"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addMemberAction, type AddMemberState } from "./actions";

export function AddMemberForm() {
  const [state, action, pending] = useActionState<AddMemberState, FormData>(addMemberAction, {});

  return (
    <form
      action={action}
      key={state.added}
      className="rounded-md border border-border bg-card p-3 space-y-3"
    >
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-secondary">Add a member</p>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className="space-y-1 text-sm font-semibold">
          Name
          <Input name="displayName" required maxLength={40} placeholder="Aunt Jo" autoComplete="off" />
        </label>
        <label className="space-y-1 text-sm font-semibold">
          Phone (for the Magic Link text)
          <Input name="phone" type="tel" maxLength={32} placeholder="(256) 555-0140" autoComplete="off" />
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create Magic Link"}
        </Button>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.added ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.added} is in. Copy their link below and send it to them.
        </p>
      ) : null}
    </form>
  );
}
