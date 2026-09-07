/**
 * What every console edit answers with: a refusal to show, or a sentence
 * saying what happened. Kept free of database imports because the forms are
 * client components and read this same type.
 */
export interface ActionState {
  error?: string;
  done?: string;
}

/**
 * What one console edit did: the sentence for the screen, and every path whose
 * cache it invalidated. The paths are the edit's own answer rather than the
 * wrapper's, because which screens a change shows up on is what the edit
 * knows and the plumbing does not.
 */
export interface EditOutcome {
  done?: string;
  revalidate: string[];
}
