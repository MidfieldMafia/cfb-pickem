import type { ReactNode } from "react";
import { cn } from "cn";

/** The rust caps label from the type scale: 12/16, 700, uppercase, .08em. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-[0.08em] text-secondary", className)}>
      {children}
    </div>
  );
}
