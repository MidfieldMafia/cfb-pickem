"use client";

import { useActionState, type ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import type { ManageState } from "@/lib/groups/manage-state";

type Action = (prev: ManageState, formData: FormData) => Promise<ManageState>;

/**
 * One form per Manage edit, like the console's `ActionForm`, plus the one thing
 * it does not have: a Magic Link just made, shown with a Copy button. The link
 * lives only in this form's state, so it is gone on the next page load — the
 * screen itself never has it to draw again.
 */
export function ManageForm({
  action,
  hidden,
  children,
  submit,
  pendingLabel,
  variant = "outline",
  className,
}: {
  action: Action;
  hidden: Record<string, string | number>;
  children?: ReactNode;
  submit: string;
  pendingLabel: string;
  variant?: "default" | "outline" | "destructive" | "secondary";
  className?: string;
}) {
  const [state, formAction, pending] = useActionState<ManageState, FormData>(action, {});
  return (
    // Keyed on the link, so a successful add clears the name and phone fields.
    <form action={formAction} key={state.link} className={className ?? "space-y-2"}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <Button type="submit" size="sm" variant={variant} disabled={pending}>
        {pending ? pendingLabel : submit}
      </Button>
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
      {state.link ? (
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{state.link}</code>
          <CopyButton text={state.link} />
        </div>
      ) : null}
    </form>
  );
}
