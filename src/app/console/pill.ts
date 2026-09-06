/** The console's selected-pill look, shared by the nav and the candidate filters. */
export function pillClass(active: boolean): string {
  return `rounded-md px-3 py-2 text-sm font-semibold no-underline ${
    active ? "bg-primary text-primary-foreground" : "hover:bg-accent"
  }`;
}
