"use client";

import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useActionState } from "react";
import { SECTION_LABEL } from "@/components/section-label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Avatar } from "@/lib/avatars";
import { MAX_DISPLAY_NAME } from "@/lib/members/limits";
import { saveWelcome, type WelcomeState } from "./actions";

export function WelcomeForm({
  avatars,
  displayName,
  avatarId,
  returning,
}: {
  avatars: readonly Avatar[];
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

      <fieldset className="space-y-2">
        <legend className={SECTION_LABEL}>Pick your pennant</legend>
        <div className="grid grid-cols-[repeat(auto-fill,72px)] gap-2">
          {avatars.map((avatar) => (
            <label key={avatar.id} className="cursor-pointer">
              <input
                type="radio"
                name="avatarId"
                value={avatar.id}
                defaultChecked={avatar.id === avatarId}
                className="peer sr-only"
                required
              />
              <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full border border-border bg-card p-1 peer-checked:border-primary peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                <Image src={avatar.file} alt={avatar.name} width={72} height={72} unoptimized className="w-full h-auto rounded-full" />
              </span>
            </label>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Twelve pennants, one per member. Pick the one that feels like you.
        </p>
      </fieldset>

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
        {returning ? null : (
          <Link href="/rules" className="tap inline-flex items-center text-sm font-semibold underline underline-offset-4">
            See how to play
          </Link>
        )}
      </div>
    </form>
  );
}
