import { Wordmark } from "@saturday-slate/design-system";
import { RivalryStrip } from "@/components/week-look";

/**
 * What shows while a screen's server work runs. Every member and console
 * layout awaits the session and the database before it can render anything,
 * so without this the launch splash ends on an empty page until they finish.
 * The Wordmark on paper is the same picture the splash showed, so the hand-off
 * from splash to app is not a visible change.
 *
 * It renders before any layout has read the Week, so the Rivalry Week band
 * under the Wordmark shows by CSS, from the Look the member screens last
 * remembered (`LOOK_KEY`).
 */
export default function Loading() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6" aria-busy="true">
      <Wordmark size="lg" />
      <RivalryStrip className="launch-look w-full" />
    </main>
  );
}
