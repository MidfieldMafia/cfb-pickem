import Link from "next/link";

/**
 * The two faces of the Live Board tab, as mockups 05 and 06 draw them: the
 * board itself, and the week's results. Week results kept its own route
 * (`/results?week=N`), so this is two links rather than a control — a GET
 * each way, nothing to hydrate, and the URL says which face is on screen.
 */
export function BoardToggle({ active, weekNumber }: { active: "live" | "results"; weekNumber: number | null }) {
  const pills = [
    { key: "live", href: "/live", label: "Live Board" },
    {
      key: "results",
      href: weekNumber === null ? "/results" : `/results?week=${weekNumber}`,
      label: weekNumber === null ? "Week results" : `Week ${weekNumber} results`,
    },
  ] as const;
  return (
    <nav aria-label="Live Board or results" className="flex flex-wrap gap-2">
      {pills.map(({ key, href, label }) => {
        const here = key === active;
        return (
          <Link
            key={key}
            href={href}
            aria-current={here ? "page" : undefined}
            className={`flex min-h-tap items-center rounded-full border px-4 font-semibold no-underline ${
              here ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
