/**
 * The console's selected-pill look, worn by the slate builder's candidate
 * filters. They are links, so they carry the 44px minimum themselves: the base
 * layer only forces it on buttons and inputs.
 */
export function pillClass(active: boolean): string {
  return `flex min-h-tap items-center rounded-md px-3 text-sm font-semibold no-underline ${
    active ? "bg-primary text-primary-foreground" : "hover:bg-accent"
  }`;
}
