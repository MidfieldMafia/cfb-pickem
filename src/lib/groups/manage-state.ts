/**
 * What a Manage form answers with. Kept free of database imports, like
 * `console/state.ts`, because the forms are client components.
 */
/** A group's Manage screen. */
export const managePath = (groupId: number) => `/manage/${groupId}`;

export interface ManageState {
  error?: string;
  done?: string;
  /** A Magic Link just made, shown this once and never read back. */
  link?: string;
  /** The actor stepped down, so the Manage screen is no longer theirs. */
  gone?: boolean;
}
