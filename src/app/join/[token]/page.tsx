import Link from "next/link";
import { redirect } from "next/navigation";
import { NewPersonFields } from "@/components/new-person-fields";
import { TextMyLink } from "@/components/text-my-link";
import { Button, Wordmark } from "@saturday-slate/design-system";

import { db } from "@/db";
import { avatars } from "@/lib/avatars";
import { groupForJoinLink, joinStanding } from "@/lib/groups/join";
import { currentMember } from "@/lib/members/current";
import { JoinForm } from "./join-form";

/**
 * A group's Join Link. On a path of its own rather than under `/m/`, because it
 * names a group and not a person: anyone holding it may use it.
 *
 * - A link that was reset (or never was) gets a friendly dead end.
 * - Signed out: name, phone number, pennant, then How to play and the install steps.
 * - Signed in and already in the group: switched to it, via `open`, because a
 *   page cannot set a cookie while it renders.
 * - Signed in and removed: told to ask their organizer (#136).
 * - Signed in otherwise, left included: one tap.
 */
export default async function JoinLink({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const database = db();
  const group = await groupForJoinLink(database, token);
  if (!group) {
    return (
      <Notice title="This link was reset">
        Whoever runs the group made a new one. Ask your organizer for the new link and open that one instead.
      </Notice>
    );
  }

  const member = await currentMember();
  if (!member) {
    return (
      <Screen title={`Join ${group.name}`} lede="Set yourself up once. After that the app remembers you on this phone.">
        <JoinForm token={token} submit={`Join ${group.name}`}>
          <NewPersonFields avatars={avatars} />
        </JoinForm>
        <TextMyLink />
      </Screen>
    );
  }

  const standing = await joinStanding(database, member.id, group.id);
  if (standing === "in") redirect(`/join/${encodeURIComponent(token)}/open`);
  if (standing === "removed") {
    return (
      <Notice title={`You were removed from ${group.name}`}>
        Ask your organizer to add you back. Your picks are still yours, and still count in your other groups.
      </Notice>
    );
  }
  return (
    <Screen
      title={`Join ${group.name}?`}
      lede={
        standing === "left"
          ? `You’re back with everything you had in ${group.name}. Your picks count in every group you’re in.`
          : `You play as ${member.displayName}, with the picks you already make. Only weeks from today on count for you in ${group.name}.`
      }
    >
      <JoinForm token={token} submit={`Join ${group.name}`} />
      <Link href="/" className="tap mx-auto inline-flex items-center text-sm font-semibold underline underline-offset-4">
        Not now
      </Link>
    </Screen>
  );
}

function Screen({ title, lede, children }: { title: string; lede: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex justify-center">
        <Wordmark />
      </div>
      <div className="space-y-2 text-center">
        <h1 className="font-display text-4xl leading-10">{title}</h1>
        <p className="text-muted-foreground">{lede}</p>
      </div>
      {children}
    </main>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-16 text-center">
      <Wordmark />
      <div className="max-w-sm space-y-3">
        <h1>{title}</h1>
        <p className="text-muted-foreground">{children}</p>
      </div>
      <Button asChild variant="outline">
        <Link href="/">Go to Saturday Slate</Link>
      </Button>
    </main>
  );
}
