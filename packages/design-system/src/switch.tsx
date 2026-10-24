import * as React from "react"
import { cn } from "cn"

/**
 * An on/off switch: a `button` with `role="switch"` and `aria-checked`, a
 * 48×28 track inside a 44px-tall, 52px-wide tap target. On is a pine track
 * with a light knob on the right; off is a muted track with a 2px
 * `muted-foreground` border and its knob on the left. Disabled is the off look
 * at half opacity.
 *
 * Name it with `aria-labelledby` pointing at the row's visible label, or an
 * `aria-label` when there is none. `onCheckedChange` gets the value a tap asks
 * for; the switch only shows `checked`, so a caller that has to ask the
 * browser first (notification permission) flips it once that answers.
 */
function Switch({
  checked,
  onCheckedChange,
  className,
  ...props
}: Omit<React.ComponentProps<"button">, "type" | "role" | "aria-checked" | "onChange"> & {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-slot="switch"
      data-state={checked ? "on" : "off"}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "flex h-tap w-13 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "relative block h-7 w-12 rounded-full transition-colors",
          checked ? "bg-primary" : "border-2 border-muted-foreground bg-muted"
        )}
      >
        <span
          className={cn(
            "absolute top-[3px] rounded-full transition-[left]",
            checked ? "left-[23px] size-[22px] bg-primary-foreground" : "left-[3px] size-[18px] bg-muted-foreground"
          )}
        />
      </span>
    </button>
  )
}

export { Switch }
