/** The console's selected-pill look, worn by the slate builder's candidate filters. */
export function pillClass(active: boolean): string {
  return `rounded-md px-3 py-2 text-sm font-semibold no-underline ${
    active ? "bg-primary text-primary-foreground" : "hover:bg-accent"
  }`;
}
