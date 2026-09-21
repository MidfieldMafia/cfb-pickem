"use client";

import { useActionState } from "react";
import { Button, Input } from "@saturday-slate/design-system";

import { textMyLinkAction } from "@/app/text-my-link/actions";
import type { ActionState } from "@/lib/console/state";
import { MAX_PHONE } from "@/lib/members/limits";

/**
 * "Text me my link" for someone signed out who already plays: their own phone
 * number gets their own Magic Link, and nobody is signed in from here. A
 * separate form from the one it sits beside, which it must never be nested in.
 */
export function TextMyLink({ id = "textLinkPhone" }: { id?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(textMyLinkAction, {});
  return (
    <form action={action} className="w-full space-y-2 text-left">
      <label htmlFor={id} className="block text-sm font-semibold">
        Already play? Text me my link
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          name="phone"
          type="tel"
          maxLength={MAX_PHONE}
          required
          autoComplete="tel"
          placeholder="Your phone number"
          className="flex-1"
        />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Sending…" : "Text me"}
        </Button>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.done ? (
        <p role="status" className="text-sm font-semibold">
          {state.done}
        </p>
      ) : null}
    </form>
  );
}
