import type { ReactNode } from "react"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { cn } from "cn"

/**
 * The app's text link: 14px, semibold, always underlined, in the text colour.
 * `tap` lifts an anchor to the 44px target (a button gets it from the base
 * layer) and `inline-flex items-center` keeps the label centred in it. For a
 * link that stands on its own line; a link inside running text wants none of
 * this. `Button variant="link"` is shadcn's pine hover-underline, not this.
 */
export const LINK = "tap inline-flex items-center text-sm font-semibold underline underline-offset-4"

type BackLinkProps = { children: ReactNode; className?: string } & (
  | { href: string; onClick?: never }
  | { onClick: () => void; href?: never }
)

/**
 * A chevron and a label, one step back: a link with `href`, a button with
 * `onClick`. `-ml-2 px-2` widens the target without moving the chevron off the
 * gutter. An icon-only one takes its label as `<span className="sr-only">`.
 */
export function BackLink({ children, className, ...to }: BackLinkProps) {
  const classes = cn("tap -ml-2 inline-flex items-center gap-1 px-2 font-semibold no-underline", className)
  const body = (
    <>
      <ChevronLeft aria-hidden className="size-5 shrink-0" />
      {children}
    </>
  )
  return to.href !== undefined ? (
    <Link href={to.href} className={classes}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={to.onClick} className={classes}>
      {body}
    </button>
  )
}
