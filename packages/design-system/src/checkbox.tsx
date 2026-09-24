import * as React from "react"
import { cn } from "cn"

/**
 * A native checkbox in the primary color. The box is 20px inside a 44px
 * target — the tap minimum — so the wrapping label is the hit area and the box
 * stays small. `min-h-0` is what stops the base layer's 44px `input` minimum
 * stretching the box itself.
 *
 * With no visible text beside it, give it an `aria-label`. Props go to the
 * `<input>`; `className` styles the box, not the target.
 */
function Checkbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <label data-slot="checkbox" className="flex size-tap shrink-0 items-center justify-center">
      <input
        type="checkbox"
        className={cn(
          "size-5 min-h-0 accent-primary outline-none disabled:cursor-not-allowed disabled:opacity-50",
          "focus-visible:ring-[3px] focus-visible:ring-ring/50",
          className
        )}
        {...props}
      />
    </label>
  )
}

export { Checkbox }
