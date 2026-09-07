"use client";

import { usePathname, useSearchParams } from "next/navigation";

/** One week as the switcher needs it: the number, and whether its Slate is out. */
export interface WeekChoice {
  number: number;
  published: boolean;
}

/**
 * The console's one week control, in the header where every screen can see it.
 * Every console page reads `?week=`, so switching is a plain GET to the page
 * the commissioner is already on — no server action, and the page's own
 * `openWeek` still creates the Week row on first visit.
 *
 * The weeks arrive as a prop because `WEEK_NUMBERS` and the season live in
 * `@/lib/slate/slate`, which is `server-only`.
 */
/**
 * The console screens whose work belongs to one week, and so read `?week=`.
 * Members is the exception — the roster spans the season — and there the chip
 * states the week without offering to change it, rather than being a control
 * that does nothing.
 */
const WEEKLY = ["/console/slate", "/console/picks", "/console/results"];

/** The chip, whether it switches the week or only names it. */
const CHIP = "flex items-center gap-1.5 rounded-full bg-secondary px-3 text-sm font-bold text-secondary-foreground";

export function WeekSwitcher({ year, weeks, fallback }: { year: number; weeks: WeekChoice[]; fallback: number }) {
  const pathname = usePathname();
  const asked = Number(useSearchParams().get("week"));
  const current = weeks.some((w) => w.number === asked) ? asked : fallback;
  const published = weeks.find((w) => w.number === current)?.published ?? false;
  const status = published ? "published" : "draft";

  if (!WEEKLY.some((prefix) => pathname.startsWith(prefix))) {
    return (
      <p className={`${CHIP} py-1.5`}>
        <span className="tabular-nums">{year}</span> · Week <span className="tabular-nums">{current}</span> · {status}
      </p>
    );
  }

  return (
    <form
      method="get"
      action={pathname}
      // The rust chip from the mockups, with the week itself as the control:
      // reading the week and changing it are the same gesture.
      className={CHIP}
    >
      <span className="tabular-nums">{year}</span>
      <span aria-hidden>·</span>
      <select
        // Remounts when the URL moves, so the chip always names the week on screen.
        key={current}
        name="week"
        defaultValue={current}
        aria-label="Week"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="bg-transparent font-bold text-secondary-foreground"
      >
        {weeks.map((w) => (
          <option key={w.number} value={w.number} className="bg-card font-normal text-foreground">
            Week {w.number}
          </option>
        ))}
      </select>
      <span aria-hidden>·</span>
      <span>{status}</span>
      {/* Keyboard and no-JS submit; the select auto-submits for everyone else. */}
      <button type="submit" className="sr-only">
        Go to this week
      </button>
    </form>
  );
}
