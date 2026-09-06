import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * The rust caps label from the type scale: 700, uppercase, .08em, secondary.
 * Sizeless, for the few places that set their own (the matchup panel's 10/11px
 * bar captions); everywhere else wants `SECTION_LABEL`.
 */
export const CAPS_LABEL = "font-bold uppercase tracking-[0.08em] text-secondary";

/** The caps label at its type-scale size, 12/16. */
export const SECTION_LABEL = `text-xs ${CAPS_LABEL}`;

/** The caps label as the padded block that heads a section of phone chrome. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-4 pt-3 pb-1", SECTION_LABEL, className)}>{children}</div>;
}
