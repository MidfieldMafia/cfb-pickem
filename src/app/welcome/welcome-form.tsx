"use client";

import { ArrowRight } from "lucide-react";
import { useActionState } from "react";
import { PennantPicker } from "@/components/pennant-picker";
import { SECTION_LABEL, Button, Input } from "@saturday-slate/design-system";

import { MAX_DISPLAY_NAME } from "@/lib/members/limits";
import { saveWelcome, type WelcomeState } from "./actions";

export function WelcomeForm({
  displayName,
  avatarId,
  returning,
}: {
  displayName: string;
  avatarId: string | null;
  returning: boolean;
}) {
  const [state, action, pending] = useActionState<WelcomeState, FormData>(saveWelcome, {});

  return (
    <form action={action} className="flex flex-1 flex-col gap-6">
      <div className="space-y-2">
        <label htmlFor="displayName" className={`block ${SECTION_LABEL}`}>
          Your name on the leaderboard
        </label>
        <Input
          id="displayName"
          name="displayName"
          defaultValue={displayName}
          maxLength={MAX_DISPLAY_NAME}
          required
          autoComplete="nickname"
          className="text-lg"
        />
      </div>

      <PennantPicker selected={avatarId} />

      {state.error ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="mt-auto space-y-3 pt-4 text-center">
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Saving…" : returning ? "Save" : "Continue"}
          {pending || returning ? null : <ArrowRight aria-hidden />}
        </Button>
      </div>
    </form>
  );
}
