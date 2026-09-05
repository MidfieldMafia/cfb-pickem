import { redirect } from "next/navigation";
import { Wordmark } from "@/components/wordmark";
import { currentMember } from "@/lib/members/current";

export default async function Home() {
  const member = await currentMember();
  if (member) redirect("/week");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-16 text-center">
      <Wordmark size="lg" />
      <div className="max-w-sm space-y-3">
        <h1>Family college football pick&rsquo;em</h1>
        <p className="text-muted-foreground">
          Open the personal link a commissioner sent you and you&rsquo;re in. No passwords,
          no accounts.
        </p>
      </div>
    </main>
  );
}
