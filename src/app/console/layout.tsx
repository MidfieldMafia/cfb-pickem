import Link from "next/link";
import { Pennant } from "@/components/pennant";
import { Wordmark } from "@/components/wordmark";
import { requireConsole } from "@/lib/members/current";
import { ConsoleNav } from "./console-nav";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const commissioner = await requireConsole();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Wordmark href="/console" />
          <span className="hidden sm:inline text-xs font-bold uppercase tracking-[0.08em] text-secondary">
            Commissioner console
          </span>
        </div>
        <Link href="/welcome" className="flex items-center gap-2 text-sm font-semibold no-underline">
          <Pennant avatarId={commissioner.avatarId} size={28} />
          {commissioner.displayName}
        </Link>
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        <ConsoleNav />
        <main className="flex-1 px-4 py-6">{children}</main>
      </div>
    </div>
  );
}
