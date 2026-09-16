import * as React from "react"
import { cn } from "cn"
import { Slot } from "radix-ui"

// The phone card: 14px radius, flat, 12px padding. The radius is the rule —
// a phone surface is `xl`, a console panel and its inner rows are `md`, and a
// surface never mixes the two at the same level. A console panel passes
// `rounded-md` as a className rather than reaching for a variant, so there is
// exactly one Card and the exception reads at the call site.
//
// Card owns the padding, so the slots below carry none of their own. Stock
// shadcn puts `px-6` on header/content/footer and `py-6` on Card; keeping both
// here would double the inset on every converted surface.
// `asChild` follows Badge: several surfaces being converted are `<section>` or
// `<li>`, and rendering them as a `div` would drop that semantics for styling.
function Card({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div"
  return (
    <Comp
      data-slot="card"
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border bg-card p-3 text-card-foreground",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-3",
        className
      )}
      {...props}
    />
  )
}

// `asChild` here for the same reason as on Card: a console panel's title is an
// `<h2>`, and the slot must not cost the page its heading outline.
function CardTitle({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div"
  return (
    <Comp
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={className} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center [.border-t]:pt-3", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
