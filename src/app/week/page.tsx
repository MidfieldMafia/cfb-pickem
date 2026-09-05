import Link from "next/link";
import { Pennant } from "@/components/pennant";
import { Wordmark } from "@/components/wordmark";
import { requireMember } from "@/lib/members/current";

/** Placeholder until the slate builder and pick entry tickets land. */
export default async function Week() {
  const member = await requireMember();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <Wordmark />
        <Link href="/welcome" className="flex items-center gap-2 text-sm font-semibold no-underline">
          <Pennant avatarId={member.avatarId} size={28} />
          {member.displayName}
        </Link>
      </header>
      <section className="rounded-md border border-border bg-card p-3 space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-secondary">This week</p>
        <h1>The slate isn&rsquo;t posted yet</h1>
        <p className="text-muted-foreground">
          Check back once a commissioner publishes this week&rsquo;s games. Your picks will live here.
        </p>
      </section>
      {member.isCommissioner ? (
        <Link href="/console" className="text-sm font-semibold underline underline-offset-4">
          Open the commissioner console
        </Link>
      ) : null}
    </main>
  );
}
