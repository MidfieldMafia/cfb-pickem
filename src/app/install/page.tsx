import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { db } from "@/db";
import { requireMember } from "@/lib/members/current";
import { publishedSlate } from "@/lib/slate/slate";
import { InstallGuide } from "./install-guide";

/**
 * The second half of the welcome: getting Saturday Slate onto the home screen
 * while the member is still in the browser session their Magic Link opened.
 */
export default async function Install() {
  await requireMember();
  const slate = await publishedSlate(db());

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex justify-center">
        <Wordmark />
      </div>

      <div className="space-y-2 text-center">
        <h1 className="font-display text-4xl leading-10">Put it on your home screen</h1>
        <p className="text-muted-foreground">
          One tap on Saturdays instead of digging for the text message.
        </p>
      </div>

      <InstallGuide />

      <div className="mt-auto space-y-3 pt-4 text-center">
        <Button asChild size="lg" className="w-full">
          <Link href="/week">Done, start picking</Link>
        </Button>
        <Link href="/week" className="tap inline-flex items-center text-sm font-semibold underline underline-offset-4">
          Skip for now
        </Link>
        {slate?.deadline ? (
          <p className="text-sm text-muted-foreground">
            Week {slate.week.weekNumber} picks lock <LocalTime at={slate.deadline} style="slot" />.
          </p>
        ) : null}
      </div>
    </main>
  );
}
