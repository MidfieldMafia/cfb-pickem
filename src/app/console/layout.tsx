import { MemberChip } from "@/components/member-chip";
import { SECTION_LABEL } from "@/components/section-label";
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
          <span className={`hidden sm:inline ${SECTION_LABEL}`}>Commissioner console</span>
        </div>
        <MemberChip member={commissioner} />
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        <ConsoleNav />
        <main className="flex-1 px-4 py-6">{children}</main>
      </div>
    </div>
  );
}
