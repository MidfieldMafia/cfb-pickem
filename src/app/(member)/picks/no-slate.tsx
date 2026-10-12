import Link from "next/link";
import { Card, SECTION_LABEL, Wordmark, LINK } from "@saturday-slate/design-system";
import type { TourTarget } from "@/tours/tours";

/**
 * Shown at /picks, /picks/review and /live before a commissioner publishes a
 * slate. It has no header, so the whole screen is the tab's Welcome Tour
 * target, `tour`.
 */
export function NoSlate({ tour }: { tour: Extract<TourTarget, "picks-screen" | "live-screen"> }) {
  return (
    <main data-tour={tour} className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
      <Wordmark />
      <Card asChild className="gap-2">
        <section>
          <p className={SECTION_LABEL}>This week</p>
          <h1>The slate isn&rsquo;t posted yet</h1>
          <p className="text-muted-foreground">Check back once a commissioner publishes this week&rsquo;s games.</p>
          <Link href="/" className={LINK}>
            Back to this week
          </Link>
        </section>
      </Card>
    </main>
  );
}
