import { Wordmark } from "@/components/wordmark";
import { avatars } from "@/lib/avatars";
import { requireMember } from "@/lib/members/current";
import { WelcomeForm } from "./welcome-form";

export default async function Welcome() {
  const member = await requireMember();
  const returning = member.welcomedAt !== null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex justify-center">
        <Wordmark />
      </div>
      <div className="space-y-2 text-center">
        <h1 className="font-display text-4xl leading-10">
          {returning ? "Your name and pennant" : "Welcome to the 2026 season"}
        </h1>
        {returning ? null : (
          <p className="text-muted-foreground">
            This link is yours. Keep it; it signs you in on any phone.
          </p>
        )}
      </div>
      <WelcomeForm
        avatars={avatars}
        displayName={member.displayName}
        avatarId={member.avatarId}
        returning={returning}
      />
    </main>
  );
}
