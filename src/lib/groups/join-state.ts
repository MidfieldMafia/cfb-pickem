/**
 * What a Join Link, Start a group, or You screen form answers with when it does
 * not move on. Free of database imports, like `manage-state.ts`, because the
 * forms are client components.
 */
export interface JoinState {
  error?: string;
  done?: string;
}
