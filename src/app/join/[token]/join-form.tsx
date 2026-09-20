"use client";

import { useActionState, type ReactNode } from "react";
import { Button } from "@saturday-slate/design-system";

import type { JoinState } from "@/lib/groups/join-state";
import { joinAction } from "./actions";

/**
 * The Join Link's one form: the new-person fields when signed out, nothing but
 * the button when signed in. The token rides along hidden; the server looks the
 * group up again rather than trusting anything else the page drew.
 */
export function JoinForm({ token, submit, children }: { token: string; submit: string; children?: ReactNode }) {
  const [state, action, pending] = useActionState<JoinState, FormData>(joinAction, {});
  return (
    <form action={action} className="flex flex-1 flex-col gap-6">
      <input type="hidden" name="token" value={token} />
      {children}
      {state.error ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="mt-auto pt-4">
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Joining…" : submit}
        </Button>
      </div>
    </form>
  );
}
