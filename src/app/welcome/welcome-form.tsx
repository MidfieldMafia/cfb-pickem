"use client";

import { ArrowRight } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { useActionState } from "react";
import { PennantPicker } from "@/components/pennant-picker";
import { SECTION_LABEL, Button, Input } from "@saturday-slate/design-system";

import { NEW_PHOTO } from "@/lib/avatars";
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
  const [state, action, pending] = useActionState<WelcomeState, FormData>(save, {});

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

      <PennantPicker selected={avatarId} photo />

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

/**
 * Save, with a dropped request or a server fault kept on this page as a line
 * above the button instead of an error screen: a crop lives only in page
 * state, and leaving would lose it (#231). Pressing Save again is the retry.
 * The redirect a successful Save ends in is thrown too, and must go through.
 */
async function save(previous: WelcomeState, form: FormData): Promise<WelcomeState> {
  try {
    return await saveWelcome(previous, form);
  } catch (error) {
    unstable_rethrow(error);
    return {
      error:
        form.get("avatarId") === NEW_PHOTO
          ? "Your photo didn’t save. Press Save to try again."
          : "That didn’t save. Press Save to try again.",
    };
  }
}
