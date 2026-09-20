import Link from "next/link";
import { Card, SECTION_LABEL, Wordmark } from "@saturday-slate/design-system";

/** Shown at /picks and /picks/review before a commissioner publishes a slate. */
export function NoSlate() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
      <Wordmark />
      <Card asChild className="gap-2">
        <section>
          <p className={SECTION_LABEL}>This week</p>
          <h1>The slate isn&rsquo;t posted yet</h1>
          <p className="text-muted-foreground">Check back once a commissioner publishes this week&rsquo;s games.</p>
          <Link href="/" className="text-sm font-semibold underline underline-offset-4">
            Back to this week
          </Link>
        </section>
      </Card>
    </main>
  );
}
