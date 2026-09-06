import Link from "next/link";
import { SECTION_LABEL } from "@/components/section-label";
import { Wordmark } from "@/components/wordmark";

/** Shown at /picks and /picks/review before a commissioner publishes a slate. */
export function NoSlate() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
      <Wordmark />
      <section className="rounded-md border border-border bg-card p-3 space-y-2">
        <p className={SECTION_LABEL}>This week</p>
        <h1>The slate isn&rsquo;t posted yet</h1>
        <p className="text-muted-foreground">Check back once a commissioner publishes this week&rsquo;s games.</p>
        <Link href="/week" className="text-sm font-semibold underline underline-offset-4">
          Back to this week
        </Link>
      </section>
    </main>
  );
}
