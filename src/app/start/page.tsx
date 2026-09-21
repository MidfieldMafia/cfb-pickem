import { Wordmark } from "@saturday-slate/design-system";

import { TextMyLink } from "@/components/text-my-link";
import { avatars } from "@/lib/avatars";
import { currentMember } from "@/lib/members/current";
import { StartForm } from "./start-form";

/**
 * Anyone can start a group, signed in or not, with no cap (spec #130). The
 * person who starts it is its organizer. Signed out, they set themselves up on
 * the way; signed in, they keep every group they are already in.
 */
export default async function StartGroup() {
  const member = await currentMember();
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex justify-center">
        <Wordmark />
      </div>
      <div className="space-y-2 text-center">
        <h1 className="font-display text-4xl leading-10">Start a group</h1>
        <p className="text-muted-foreground">
          Your own pick&rsquo;em for your people: the same games every week, your own leaderboard.
        </p>
      </div>
      <StartForm avatars={member ? null : avatars} />
      {member ? null : <TextMyLink />}
    </main>
  );
}
