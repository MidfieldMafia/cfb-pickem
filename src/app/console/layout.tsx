import { db } from "@/db";
import { MemberChip } from "@/components/member-chip";
import { SECTION_LABEL } from "@/components/section-label";
import { Wordmark } from "@/components/wordmark";
import { requireConsole } from "@/lib/members/current";
import { activeSeason, defaultWeekNumber, seasonWeeks, WEEK_NUMBERS } from "@/lib/slate/slate";
import { ConsoleNav } from "./console-nav";
import { WeekSwitcher } from "./week-switcher";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const commissioner = await requireConsole();
  const database = db();
  const season = await activeSeason(database);
  const existing = await seasonWeeks(database, season);
  const published = new Set(existing.filter((w) => w.published).map((w) => w.weekNumber));
  // Every week a commissioner can open, not only the rows that exist: opening
  // a week is how it comes into being, and the page does that on arrival.
  const weeks = WEEK_NUMBERS.map((number) => ({ number, published: published.has(number) }));

  return (
    // On a laptop the console is a fixed shell — header and rail stay put, the
    // screen scrolls inside `main`, so the rail's "Open the app" sits at the
    // bottom of the window rather than below a slate of 99 candidates. A phone
    // keeps ordinary document scrolling.
    // `md:flex-none` matters: as a grown flex child of the body this would take
    // its height from the slate below it and `h-dvh` would never bite.
    <div className="flex flex-1 flex-col md:h-dvh md:flex-none md:overflow-hidden">
      {/* Wraps rather than overflows: the wordmark, the week and the member
          chip do not fit one phone line. */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Wordmark href="/console" />
          <span className={`hidden border-l border-border pl-3 sm:inline ${SECTION_LABEL}`}>Commissioner console</span>
        </div>
        <div className="flex items-center gap-3">
          <WeekSwitcher year={season.year} weeks={weeks} fallback={defaultWeekNumber(existing)} />
          <span className="hidden h-6 border-l border-border sm:inline" aria-hidden />
          <MemberChip member={commissioner} />
        </div>
      </header>
      <div className="flex flex-1 flex-col md:min-h-0 md:flex-row">
        <ConsoleNav />
        <main className="flex-1 px-4 py-6 md:overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
