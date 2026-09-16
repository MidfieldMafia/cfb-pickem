import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { SECTION_LABEL } from "@/components/section-label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import { db } from "@/db";
import { appUrl } from "@/lib/app-url";
import { joinLinkFor } from "@/lib/groups/join";
import { manageGroup, NotOrganizer } from "@/lib/groups/manage";
import { managePath } from "@/lib/groups/manage-state";
import { requireMember } from "@/lib/members/current";
import { safeInteger } from "@/lib/parse";

/**
 * The screen right after starting a group: you're the organizer, and here is
 * the Join Link to share. Signed-out founders reach it from How to play and go
 * on to the install steps (`?setup=1`); signed-in ones go to their new group.
 *
 * Only someone who runs the group sees it, checked as the Manage screen checks,
 * because the Join Link is on it.
 */
export default async function Started({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ setup?: string }>;
}) {
  const member = await requireMember();
  const groupId = safeInteger((await params).groupId);
  if (groupId === null) notFound();
  const manager = await manageGroup(db(), member, groupId).catch((error: unknown) => {
    if (error instanceof NotOrganizer) notFound();
    throw error;
  });
  const inSetup = (await searchParams).setup === "1";
  const link = joinLinkFor(manager.group, appUrl());

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex justify-center">
        <Wordmark />
      </div>
      <div className="space-y-2 text-center">
        <h1 className="font-display text-4xl leading-10">You&rsquo;re the organizer</h1>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">{manager.group.name}</span> is ready. Send its Join Link to
          your group chat and everyone who opens it is in.
        </p>
      </div>

      <Card asChild className="gap-3">
        <section>
          <p className={SECTION_LABEL}>Join Link</p>
          <code className="block truncate rounded bg-muted px-2 py-2 text-xs">{link}</code>
          <CopyButton text={link} label="Copy the Join Link" size="default" variant="default" className="w-full" />
          <p className="text-sm text-muted-foreground">
            You&rsquo;ll find it again, and can reset it, under Manage in the header.
          </p>
        </section>
      </Card>

      <div className="mt-auto space-y-3 pt-4 text-center">
        <Button asChild size="lg" className="w-full">
          <Link href={inSetup ? "/install" : "/"}>{inSetup ? "Next" : `Go to ${manager.group.name}`}</Link>
        </Button>
        {inSetup ? null : (
          <Link href={managePath(manager.group.id)} className="tap inline-flex items-center text-sm font-semibold underline underline-offset-4">
            Manage {manager.group.name}
          </Link>
        )}
      </div>
    </main>
  );
}
