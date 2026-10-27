import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "./card";
import { PINE_LABEL } from "./section-label";

/**
 * The pine card at the top of a member screen: a caps label over the place on
 * the left, a caps detail over the figure on the right, and an optional
 * `leading` mark (the member's pennant) before them. Presentational: the
 * caller builds every string.
 *
 * With `href` the whole card is the link and gains a chevron; `ariaLabel` then
 * says in one sentence what the four strings say in a grid.
 *
 * `border-transparent` rather than `border-0`: the card keeps Card's 1px box,
 * so a pine card and a paper one in one column measure the same width.
 */
export function StandingCard({
  leading,
  label,
  detail,
  place,
  figure,
  href,
  ariaLabel,
}: {
  leading?: ReactNode;
  label: string;
  detail: string;
  place: string;
  figure: string;
  href?: string;
  ariaLabel?: string;
}) {
  const card = (
    <Card className="flex-row items-center border-transparent bg-primary text-primary-foreground">
      {leading}
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5">
        <span className={PINE_LABEL}>{label}</span>
        <span className={`text-right tabular-nums ${PINE_LABEL}`}>{detail}</span>
        <span className="font-display text-2xl font-black">{place}</span>
        <span className="text-right font-display text-2xl font-black tabular-nums">{figure}</span>
      </div>
      {href !== undefined && <ChevronRight size={18} aria-hidden className="shrink-0 opacity-85" />}
    </Card>
  );
  if (href === undefined) return card;
  return (
    <Link href={href} aria-label={ariaLabel} className="block rounded-xl no-underline">
      {card}
    </Link>
  );
}
