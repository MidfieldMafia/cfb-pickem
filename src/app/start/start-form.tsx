"use client";

import { ArrowRight } from "lucide-react";
import { useActionState, useState } from "react";
import { NewPersonFields } from "@/components/new-person-fields";
import { SECTION_LABEL, Button, Input } from "@saturday-slate/design-system";

import { cleanGroupName, MAX_GROUP_NAME } from "@/lib/groups/limits";
import type { JoinState } from "@/lib/groups/join-state";
import { startAction } from "./actions";

/**
 * Start a group. Signed in, it is the group name and nothing else. Signed out,
 * the group name comes first and the name, phone number and pennant second —
 * one form in two steps, so a refusal on the second (a phone number already in
 * the app) keeps the name typed on the first.
 */
export function StartForm({ signedOut }: { signedOut: boolean }) {
  const [state, action, pending] = useActionState<JoinState, FormData>(startAction, {});
  const [groupName, setGroupName] = useState("");
  const [step, setStep] = useState<"group" | "you">("group");
  const onYou = signedOut && step === "you";

  return (
    <form action={action} className="flex flex-1 flex-col gap-6">
      <div className={onYou ? "hidden" : "space-y-2"}>
        <label htmlFor="groupName" className={`block ${SECTION_LABEL}`}>
          Name your group
        </label>
        <Input
          id="groupName"
          name="groupName"
          value={groupName}
          onChange={(event) => setGroupName(event.target.value)}
          onKeyDown={(event) => {
            // Signed out, Enter on the first step moves on rather than posting half a form.
            if (!signedOut || event.key !== "Enter") return;
            event.preventDefault();
            if (cleanGroupName(groupName) !== null) setStep("you");
          }}
          maxLength={MAX_GROUP_NAME}
          required
          autoComplete="off"
          className="text-lg"
        />
        <p className="text-sm text-muted-foreground">Everyone who joins sees it at the top of the group&rsquo;s boards. You can rename it later.</p>
      </div>

      {onYou ? (
        <>
          <p className="text-center text-muted-foreground">
            Now you. You&rsquo;ll organize <span className="font-semibold text-foreground">{groupName.trim()}</span>.
          </p>
          <NewPersonFields />
        </>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="mt-auto space-y-3 pt-4 text-center">
        {signedOut && !onYou ? (
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={cleanGroupName(groupName) === null}
            onClick={() => setStep("you")}
          >
            Continue
            <ArrowRight aria-hidden />
          </Button>
        ) : (
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Starting…" : "Start the group"}
          </Button>
        )}
        {onYou ? (
          <button type="button" onClick={() => setStep("group")} className="tap text-sm font-semibold underline underline-offset-4">
            Back
          </button>
        ) : null}
      </div>
    </form>
  );
}
