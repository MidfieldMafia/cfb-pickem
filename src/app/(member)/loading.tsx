import Image from "next/image";
import { Card, HEADER_TOP } from "@saturday-slate/design-system";

/**
 * What a member screen shows while its server work runs (#262). It sits
 * inside the member layout, so a tab tap swaps only the screen: the bottom nav
 * stays put and marks the new tab at once, rather than the old screen freezing
 * until the round trip ends. Being here also makes the layout the prefetch
 * boundary, so a tab is fetched down to this skeleton before it is tapped.
 *
 * The root `loading.tsx` still covers the first load, before this layout has
 * rendered; its Wordmark is the splash, which inside the app read as a reload.
 *
 * Shapes, not content: a header at `AppHeader`'s height and a few cards, the
 * outline every member screen shares.
 */
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 pb-8" aria-busy="true">
      <span className="sr-only">Loading</span>
      <div className={`flex items-center gap-3 px-4 pb-2 ${HEADER_TOP}`}>
        <Image src="/brand/mark.svg" alt="" width={44} height={44} priority unoptimized />
        <div className="flex-1 space-y-2 motion-safe:animate-pulse">
          <div className="h-5 w-32 rounded bg-muted" />
          <div className="h-3.5 w-44 rounded bg-muted" />
        </div>
      </div>
      {[24, 36, 36].map((height, i) => (
        <Card key={i} aria-hidden className="mx-4 motion-safe:animate-pulse" style={{ height: height * 4 }}>
          <div className="h-4 w-1/3 rounded bg-muted" />
          <div className="h-3.5 w-2/3 rounded bg-muted" />
        </Card>
      ))}
    </main>
  );
}
