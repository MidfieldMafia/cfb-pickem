"use client";

import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/console/state";

export type { ActionState };

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * One form per console edit. Hidden fields carry the ids; `children` are the
 * visible inputs (scores, a note, a guess); the message under the button is
 * the action's own answer, so a refused edit reads as a sentence, not a crash.
 */
export function ActionForm({
  action,
  hidden,
  children,
  submit,
  pendingLabel,
  variant = "outline",
  size = "sm",
  className,
}: {
  action: Action;
  hidden: Record<string, string | number>;
  children?: ReactNode;
  submit: string;
  pendingLabel: string;
  variant?: "default" | "outline" | "ghost" | "destructive" | "secondary";
  size?: "sm" | "default";
  className?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  return (
    <form action={formAction} className={className ?? "space-y-2"}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <Button type="submit" size={size} variant={variant} disabled={pending}>
          {pending ? pendingLabel : submit}
        </Button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

export function ActionMessage({ state }: { state: ActionState }) {
  return (
    <>
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
    </>
  );
}
