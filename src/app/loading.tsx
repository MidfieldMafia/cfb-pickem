import { Wordmark } from "@saturday-slate/design-system";

/**
 * What shows while a screen's server work runs. Every member and console
 * layout awaits the session and the database before it can render anything,
 * so without this the launch splash ends on an empty page until they finish.
 * The Wordmark on paper is the same picture the splash showed, so the hand-off
 * from splash to app is not a visible change.
 */
export default function Loading() {
  return (
    <main className="flex flex-1 items-center justify-center" aria-busy="true">
      <Wordmark size="lg" />
    </main>
  );
}
