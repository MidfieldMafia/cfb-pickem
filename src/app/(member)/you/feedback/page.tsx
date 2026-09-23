import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireMember } from "@/lib/members/current";
import { FeedbackForm } from "./feedback-form";

/**
 * Send feedback (#237), opened from the You screen. An ordinary page in the
 * member group rather than an overlay like the photo crop, so `body`'s
 * safe-area padding already keeps the back link clear of the status bar and
 * the bottom nav clears the home indicator. Adding either inset here would
 * double it.
 */
export default async function SendFeedback() {
  await requireMember();
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pb-8">
      <div className="flex h-14 items-center">
        <Link href="/you" className="tap -ml-2 flex items-center gap-1 px-2 font-semibold no-underline">
          <ChevronLeft aria-hidden className="size-5" />
          You
        </Link>
      </div>
      <div className="space-y-1">
        <h1 className="font-display">Send feedback</h1>
        <p className="text-sm text-muted-foreground">Something broken, or an idea for the app?</p>
      </div>
      <FeedbackForm />
    </main>
  );
}
